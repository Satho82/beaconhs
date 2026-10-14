#!/usr/bin/env python3
"""DEV backup fence state machine. Only an explicit SSH operator calls mutations."""
import copy
import datetime as dt
import hashlib
import http.client
import json
import socket
import time
import urllib.parse
import dev_recovery as r

STACK = "uvanoo-v1-4-dev-gniriv"
REPEATING = ("web", "worker", "collabora")
ONESHOT = ("scheduler", "storage-init")
TERMINAL = {"complete", "shutdown", "failed", "rejected", "remove"}
WINDOW_FIELDS = {"operator", "expiresAt", "noConcurrentDeployers", "externalWritersExcluded",
                 "collaboraSessionsDrained", "restoreOriginalRestartingWriters"}

def fingerprint(value):
    return hashlib.sha256(r.canonical(value)).hexdigest()

def window(value, now=None):
    r.require(set(value) == WINDOW_FIELDS, "WINDOW_FIELDS_REJECTED")
    r.require(isinstance(value["operator"], str) and 1 <= len(value["operator"]) <= 100,
              "WINDOW_OPERATOR_REQUIRED")
    for key in WINDOW_FIELDS - {"operator", "expiresAt"}:
        r.require(value[key] is True, "EXCLUSIVE_WINDOW_ATTESTATION_REQUIRED")
    now = now or dt.datetime.now(dt.timezone.utc)
    expires = dt.datetime.fromisoformat(value["expiresAt"].replace("Z", "+00:00"))
    r.require(expires.tzinfo is not None and dt.timedelta(0) < expires-now <= dt.timedelta(hours=2),
              "EXCLUSIVE_WINDOW_EXPIRED")
    return value

class UnixHTTP(http.client.HTTPConnection):
    def __init__(self):
        super().__init__("localhost", timeout=20)
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect("/var/run/docker.sock")

class Docker:
    """Versioned compare-and-swap preserves every non-replica service field."""
    def request(self, method, path, data=None):
        conn = UnixHTTP()
        try:
            conn.request(method, "/v1.45"+path,
                         body=None if data is None else json.dumps(data),
                         headers={"Content-Type": "application/json"})
            response = conn.getresponse()
            content = response.read()
            r.require(200 <= response.status < 300, "DOCKER_REQUEST_REJECTED")
            return json.loads(content) if content else None
        finally:
            conn.close()
    def services(self):
        return {x["ID"]: x for x in self.request("GET", "/services")}
    def tasks(self, sid):
        filters = urllib.parse.quote(json.dumps({"service": [sid]}))
        return self.request("GET", "/tasks?filters="+filters)
    def set_replicas(self, current, count):
        spec = copy.deepcopy(current["Spec"])
        spec["Mode"]["Replicated"]["Replicas"] = count
        self.request("POST", "/services/"+current["ID"]+"/update?version="+
                     str(current["Version"]["Index"]), spec)

def desired(service, count):
    spec = copy.deepcopy(service["Spec"])
    spec["Mode"]["Replicated"]["Replicas"] = count
    return spec

def select(services):
    selected = {}
    for sid, service in services.items():
        spec = service["Spec"]
        labels = spec.get("Labels", {})
        if labels.get("com.docker.stack.namespace") == STACK:
            name = spec["Name"]
            r.require(name.startswith(STACK+"_"), "DEV_NAME_REJECTED")
            role = name[len(STACK)+1:]
            r.require(role in REPEATING+ONESHOT, "UNKNOWN_DEV_SERVICE")
            r.require(set(spec["Mode"]) == {"Replicated"} and
                      type(spec["Mode"]["Replicated"].get("Replicas")) is int,
                      "SERVICE_MODE_REJECTED")
            r.require(role not in selected, "DUPLICATE_DEV_SERVICE")
            selected[role] = sid
    r.require(set(selected) == set(REPEATING+ONESHOT), "DEV_SERVICE_SET_REJECTED")
    return selected

def no_tasks(api, ids):
    for sid in ids:
        # Inspect actual state, including desired-shutdown tasks still running.
        r.require(all(t["Status"]["State"] in TERMINAL for t in api.tasks(sid)),
                  "WRITER_TASKS_NOT_DRAINED")

class Fence:
    def __init__(self, api, baseline, receipt, journal):
        self.api, self.baseline, self.receipt, self.journal = api, baseline, receipt, journal
        self.selected = select(baseline)
        self.owned = {}  # sid -> exact post-update spec AND version
    def check_specs(self):
        window(self.receipt)
        live = self.api.services()
        r.require(set(live) == set(self.baseline), "SERVICE_SET_CHANGED")
        for sid, original in self.baseline.items():
            expected = self.owned.get(sid, original)
            r.require(live[sid]["Spec"] == expected["Spec"] and
                      live[sid]["Version"]["Index"] == expected["Version"]["Index"],
                      "SERVICE_CONCURRENT_CHANGE")
        no_tasks(self.api, [self.selected[x] for x in ONESHOT])
        return live
    def acquire(self, probe, timeout=90):
        self.check_specs()
        probe(False)
        self.journal("fence-intent", {"services": self.baseline, "window": self.receipt})
        for role in REPEATING:
            live = self.check_specs()
            sid = self.selected[role]
            original = live[sid]
            if original["Spec"]["Mode"]["Replicated"]["Replicas"] == 0:
                continue
            # Record intent BEFORE mutation. A crash keeps writers fenced; never auto-resume.
            self.journal("replica-intent-"+role, {"id": sid, "before": original})
            self.api.set_replicas(original, 0)
            observed = self.api.services()[sid]
            r.require(observed["Spec"] == desired(original, 0) and
                      observed["Version"]["Index"] > original["Version"]["Index"],
                      "FENCE_UPDATE_NOT_CONFIRMED")
            self.owned[sid] = observed
            self.journal("replica-fenced-"+role, observed)
        deadline = time.monotonic()+timeout
        while True:
            self.check_specs()
            try:
                no_tasks(self.api, list(self.selected.values()))
                probe(True)
                break
            except r.Rejected as exc:
                if str(exc) != "WRITER_TASKS_NOT_DRAINED" or time.monotonic() >= deadline:
                    raise
                time.sleep(1)
        self.verify(probe)
        self.journal("fence-acquired", {"owned": self.owned})
    def verify(self, probe):
        self.check_specs()
        no_tasks(self.api, list(self.selected.values()))
        probe(True)
    def restore(self, probe):
        try:
            self._restore(probe)
        except Exception:
            self.refence_owned()
            raise
    def refence_owned(self):
        # Never overwrite an operator change; only CAS versions last owned by us.
        failures = []
        for sid, expected in list(self.owned.items()):
            try:
                live = self.api.services()[sid]
                r.require(live["Spec"] == expected["Spec"] and
                          live["Version"]["Index"] == expected["Version"]["Index"],
                          "REFENCE_CONCURRENT_CHANGE")
                if live["Spec"]["Mode"]["Replicated"]["Replicas"] != 0:
                    self.api.set_replicas(live, 0)
                    current = self.api.services()[sid]
                    r.require(current["Spec"] == desired(live, 0), "REFENCE_NOT_CONFIRMED")
                    self.owned[sid] = current
            except Exception:
                failures.append(sid)
        self.journal("failure-refence", {"unverifiedServiceIds": failures,
                     "owned": self.owned, "manualReviewRequired": True})
    def _restore(self, probe):
        # Only this instance's exact zero-replica versions can be restored.
        # Failed/abandoned operation requires reviewed journal recovery, never blind scale=1.
        self.verify(probe)
        for role in reversed(REPEATING):
            sid = self.selected[role]
            if sid not in self.owned:
                continue
            live = self.check_specs()
            count = self.baseline[sid]["Spec"]["Mode"]["Replicated"]["Replicas"]
            self.journal("restore-intent-"+role, {"id": sid, "replicas": count})
            self.api.set_replicas(live[sid], count)
            observed = self.api.services()[sid]
            r.require(observed["Spec"] == self.baseline[sid]["Spec"] and
                      observed["Version"]["Index"] > live[sid]["Version"]["Index"],
                      "RESTORE_UPDATE_NOT_CONFIRMED")
            self.owned[sid] = observed
            self.journal("restored-"+role, observed)
        self.check_specs()
        self.journal("original-specs-restored", {"restored": True,
                      "applicationHealth": "NOT_CLAIMED"})

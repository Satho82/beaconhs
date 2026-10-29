import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("observer", Path(__file__).with_name("collect_collabora_observer.py"))
o = importlib.util.module_from_spec(spec)
spec.loader.exec_module(o)

class ObserverTests(unittest.TestCase):
    def config(self):
        return {"target": "https://dev.uvanoo.com", "collabora": {"username": "test", "password": "synthetic"},
                "wopi": {"token": "a" * 64, "sourceSha": "b" * 40, "epoch": "c" * 64}}

    def save(self, producer="a" * 36):
        return {"version": 1, "composeId": "wYb0LxLQrvj2FPI21i-Oj", "sourceSha": "b"*40,
                "epoch": "c"*64, "observedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "validForSeconds": 15, "drainageProven": False,
                "coverage": "REQUIRES_INDEPENDENT_TASK_AND_CUTOVER_VERIFICATION",
                "producer": producer, "completionWatermark": "d"*64, "inFlight": 0,
                "failedSaves": 0, "unknownOutcomes": 0, "completedSaves": 2, "eventCount": 6}

    def discover(self, service):
        return [1] if service.endswith("_collabora") else [2, 3]

    def fetch(self, pid, port, path, auth):
        if port == 9980:
            self.assertTrue(auth.startswith("Basic "))
            return "kit_assigned_count 1\ndocument_active_views_active_count_total 2\n"
        self.assertTrue(auth.startswith("Bearer "))
        return json.dumps(self.save(str(pid)*36))

    def test_collect_covers_all_tasks_without_double_counting_global_ledger(self):
        v = o.collect(self.config(), self.discover, self.fetch)
        self.assertEqual(v["activeSessions"], 2)
        self.assertEqual(v["completedSaves"], 2)
        self.assertEqual(v["webTasks"], 2)
        self.assertFalse(v["drainageProven"])
        self.assertEqual(v["historicalSaveState"], "UNKNOWN")
        self.assertNotIn("producer", v)
        self.assertNotIn("token", json.dumps(v))

    def test_metrics_missing_duplicate_noninteger_rejected(self):
        for body in ["", "kit_assigned_count 0", "kit_assigned_count 0\nkit_assigned_count 0\ndocument_active_views_active_count_total 0",
                     "kit_assigned_count NaN\ndocument_active_views_active_count_total 0",
                     "kit_assigned_count -1\ndocument_active_views_active_count_total 0"]:
            with self.subTest(body=body), self.assertRaises(ValueError):
                o.parse_metrics(body)

    def test_stale_wrong_binding_unknown_and_negative_saves_rejected(self):
        now = time.time()
        for override in [{"sourceSha": "e"*40}, {"epoch": "e"*64},
                         {"observedAt": "2000-01-01T00:00:00Z"},
                         {"failedSaves": -1}, {"inFlight": True}, {"completedSaves": "0"},
                         {"completionWatermark": "bad"}, {"drainageProven": True},
                         {"coverage": "COMPLETE"}, {"eventCount": 10001}]:
            with self.subTest(override=override), self.assertRaises(ValueError):
                v = self.save(); v.update(override)
                o.parse_save(json.dumps(v), self.config()["wopi"], now-1, time.time()+1)

    def test_replica_disagreement_fails_closed(self):
        def fetch(pid, port, path, auth):
            if port == 9980:
                return self.fetch(pid, port, path, auth)
            v = self.save(str(pid)*36); v["inFlight"] = pid
            return json.dumps(v)
        with self.assertRaises(ValueError):
            o.collect(self.config(), self.discover, fetch)

    def test_repeated_producer_fails_closed(self):
        def fetch(pid, port, path, auth):
            return self.fetch(pid, port, path, auth) if port == 9980 else json.dumps(self.save())
        with self.assertRaises(ValueError):
            o.collect(self.config(), self.discover, fetch)

    def test_task_change_fails_closed(self):
        calls = []
        def discover(service):
            calls.append(service)
            return [9] if len(calls) > 2 else self.discover(service)
        with self.assertRaises(ValueError):
            o.collect(self.config(), discover, self.fetch)

    def test_http_denial_and_diagnostics_never_become_zero(self):
        with patch.object(o, "execute", return_value="private diagnostic\n403"):
            with self.assertRaises(ValueError):
                o.request(1, 9980, "/cool/getMetrics", "Basic dGVzdA==")

    def test_transport_passes_credentials_only_on_stdin(self):
        with patch.object(o, "execute", return_value="metrics\n200") as run:
            self.assertEqual(o.request(1, 9980, "/cool/getMetrics", "Basic dGVzdA=="), "metrics")
            args, data = run.call_args.args
            self.assertNotIn("dGVzdA==", " ".join(args))
            self.assertIn(b"dGVzdA==", data)
        with self.assertRaises(ValueError):
            o.request(1, 9980, "/admin/kill", "Basic dGVzdA==")

    def test_private_file_mode_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/"config"
            p.write_text("{}");p.chmod(0o644)
            with self.assertRaises(ValueError): o.read_config(p)
            link=Path(d)/"link";link.symlink_to(p)
            with self.assertRaises(ValueError): o.read_config(link)


    def test_real_http_aggregate_exchange_and_authentication_denial(self):
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                is_metrics = self.path == "/cool/getMetrics"
                expected = "Basic dGVzdDpzeW50aGV0aWM=" if is_metrics else "Bearer " + "a"*64
                if self.headers.get("Authorization") != expected:
                    self.send_response(403); self.end_headers(); return
                body = (owner.fetch(1, 9980, self.path, expected) if is_metrics
                        else json.dumps(owner.save())).encode()
                self.send_response(200); self.end_headers(); self.wfile.write(body)
        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        original = o.execute
        def transport(args, data=None):
            # Use a disposable loopback HTTP server; real curl, parser and auth headers.
            args = args[4:]
            args[-1] = args[-1].replace(":9980/", ":"+str(server.server_port)+"/").replace(
                ":3000/", ":"+str(server.server_port)+"/")
            return original(args, data)
        try:
            with patch.object(o, "execute", side_effect=transport):
                result = o.collect(self.config(), lambda service: [1], o.request)
                self.assertEqual(result["activeSessions"], 2)
                with self.assertRaises(ValueError):
                    o.request(1, 9980, "/cool/getMetrics", "Basic d3Jvbmc=")
        finally:
            server.shutdown(); server.server_close(); thread.join()

if __name__ == "__main__":
    unittest.main()

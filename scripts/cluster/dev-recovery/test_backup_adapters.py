import copy
import datetime as dt
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import backup_fence as f
import dev_recovery as r
import recovery_components as components
import pg16_client
import isolated_rehearsal as isolated

def receipt():
    return dict(operator="fixture-operator",
                expiresAt=(dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=30)).isoformat(),
                noConcurrentDeployers=True, externalWritersExcluded=True,
                collaboraSessionsDrained=True, restoreOriginalRestartingWriters=True)

def services():
    values = {}
    for role in f.REPEATING+f.ONESHOT:
        values[role] = {"ID": role, "Version": {"Index": 10}, "Spec": {
            "Name": f.STACK+"_"+role, "Labels": {"com.docker.stack.namespace": f.STACK},
            "Mode": {"Replicated": {"Replicas": 1}},
            "TaskTemplate": {"ContainerSpec": {"Image": "fixture", "Env": ["SECRET=synthetic"]}}}}
    values["unrelated"] = {"ID": "unrelated", "Version": {"Index": 10},
                           "Spec": {"Name": "beaconhs-fixture", "Labels": {}}}
    return values

class Fake:
    def __init__(self):
        self.values = services()
        self.states = {}
        self.calls = []
        self.reject_role = None
    def services(self):
        return copy.deepcopy(self.values)
    def tasks(self, sid):
        return [{"Status": {"State": s}} for s in self.states.get(sid, [])]
    def set_replicas(self, current, count):
        sid = current["ID"]
        r.require(sid != self.reject_role, "INJECTED_UPDATE_FAILURE")
        r.require(current["Version"] == self.values[sid]["Version"], "STALE_VERSION")
        self.calls.append((sid, count))
        self.values[sid]["Spec"] = f.desired(current, count)
        self.values[sid]["Version"]["Index"] += 1

class FenceTests(unittest.TestCase):
    def setUp(self):
        self.api = Fake()
        self.events = []
        self.fence = f.Fence(self.api, self.api.services(), receipt(),
                             lambda name, data: self.events.append((name, data)))
    def test_roundtrip_exact_specs_and_oneshots_untouched(self):
        original = self.api.services()
        self.fence.acquire(lambda _: None)
        self.fence.restore(lambda _: None)
        self.assertEqual({k:v["Spec"] for k,v in original.items()},
                         {k:v["Spec"] for k,v in self.api.services().items()})
        self.assertEqual(self.api.calls,
            [("web",0),("worker",0),("collabora",0),("collabora",1),("worker",1),("web",1)])
    def test_replicas_not_assumed_one(self):
        self.api.values["web"]["Spec"]["Mode"]["Replicated"]["Replicas"] = 3
        self.api.values["worker"]["Spec"]["Mode"]["Replicated"]["Replicas"] = 0
        fence = f.Fence(self.api, self.api.services(), receipt(), lambda *_: None)
        fence.acquire(lambda _: None)
        fence.restore(lambda _: None)
        self.assertIn(("web",3), self.api.calls)
        self.assertNotIn(("worker",1), self.api.calls)
    def test_oneshot_running_rejects_before_mutation(self):
        self.api.states["scheduler"] = ["running"]
        with self.assertRaisesRegex(r.Rejected,"WRITER_TASKS"): self.fence.acquire(lambda _:None)
        self.assertEqual(self.api.calls,[])
    def test_desired_shutdown_actual_running_rejected(self):
        self.api.states["worker"] = ["running"]
        with self.assertRaisesRegex(r.Rejected,"WRITER_TASKS"):
            self.fence.acquire(lambda _:None, timeout=0)
    def test_unknown_dev_service_rejects(self):
        original = self.api.services()
        original["other"] = copy.deepcopy(original["web"])
        original["other"]["Spec"]["Name"] = f.STACK+"_unexpected"
        with self.assertRaisesRegex(r.Rejected,"UNKNOWN_DEV"):
            f.Fence(self.api,original,receipt(),lambda *_:None)
    def test_unrelated_change_rejects(self):
        self.fence.acquire(lambda _: None)
        self.api.values["unrelated"]["Version"]["Index"] += 1
        with self.assertRaisesRegex(r.Rejected,"CONCURRENT"):
            self.fence.restore(lambda _: None)
        self.assertFalse(any(count for _,count in self.api.calls))
    def test_external_writer_rejects_before_mutation(self):
        def probe(_): raise r.Rejected("EXTERNAL_WRITER")
        with self.assertRaises(r.Rejected): self.fence.acquire(probe)
        self.assertEqual(self.api.calls,[])
    def test_expired_window_rejected(self):
        value=receipt()
        value["expiresAt"]=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(seconds=1)).isoformat()
        with self.assertRaisesRegex(r.Rejected,"EXPIRED"): f.window(value)
    def test_missing_attestation_rejected(self):
        for key in f.WINDOW_FIELDS-{"operator","expiresAt"}:
            value=receipt();value[key]=False
            with self.assertRaises(r.Rejected): f.window(value)
    def test_failed_acquire_leaves_prior_writer_fenced(self):
        self.api.reject_role="worker"
        with self.assertRaises(r.Rejected): self.fence.acquire(lambda _: None)
        self.assertEqual(self.api.values["web"]["Spec"]["Mode"]["Replicated"]["Replicas"],0)
        self.assertNotIn(("web",1),self.api.calls)
    def test_restore_failure_refences_restored_services(self):
        self.fence.acquire(lambda _: None)
        self.api.reject_role="worker"
        with self.assertRaises(r.Rejected): self.fence.restore(lambda _:None)
        self.assertEqual(self.api.values["collabora"]["Spec"]["Mode"]["Replicated"]["Replicas"],0)
        self.assertIn(("collabora",0),self.api.calls[-1:])
    def test_concurrent_owned_change_never_overwritten(self):
        self.fence.acquire(lambda _:None)
        self.api.values["web"]["Spec"]["TaskTemplate"]["ContainerSpec"]["Image"]="operator-change"
        self.api.values["web"]["Version"]["Index"]+=1
        before=len(self.api.calls)
        with self.assertRaises(r.Rejected): self.fence.restore(lambda _:None)
        self.assertEqual(len(self.api.calls),before)
    def test_new_service_invalidates_capture(self):
        self.fence.acquire(lambda _:None)
        self.api.values["new"]={"ID":"new","Spec":{},"Version":{"Index":1}}
        with self.assertRaisesRegex(r.Rejected,"SERVICE_SET"): self.fence.verify(lambda _:None)

class AdapterTests(unittest.TestCase):
    def test_pinned_clients_reject_wrong_image(self):
        def inspect(args):
            if args[1]=="inspect":
                return [{"Image":"wrong","State":{"Running":True},"HostConfig":{},"Id":"x"}]
            return [{"Id":"expected"}]
        with self.assertRaisesRegex(r.Rejected,"PINNED_PG"):
            pg16_client.checked_container("fixture",inspect)
    def test_pinned_clients_reject_published_port(self):
        def inspect(args):
            if args[1]=="inspect":
                return [{"Image":"same","State":{"Running":True},
                         "HostConfig":{"PortBindings":{"5432/tcp":[{}]}},"Id":"x"}]
            return [{"Id":"same"}]
        with self.assertRaisesRegex(r.Rejected,"PUBLISHED"):
            pg16_client.checked_container("fixture",inspect)
    def test_redis_raw_info_is_text(self):
        with patch.object(r,"run",return_value=b"# Keyspace\r\ndb0:keys=1,expires=0\r\n"):
            self.assertTrue(components.redis_raw("fixture","INFO","keyspace").startswith("# Keyspace"))
    def test_redis_auth_failure_is_not_data(self):
        with patch.object(r,"run",return_value=b"NOAUTH Authentication required."):
            with self.assertRaisesRegex(r.Rejected,"AUTH"):
                components.redis_raw("fixture","CLIENT","LIST")
    def test_backup_role_enforced(self):
        with self.assertRaises(r.Rejected):
            pg16_client.command("psql",[],"fixture","uvanoo_dev","beaconhs","")
    def test_archive_preserves_bytes_and_symlinks_without_following(self):
        import tarfile
        with tempfile.TemporaryDirectory() as name:
            root=Path(name);os.chmod(root,0o700)
            source=root/"source";source.mkdir()
            (source/"object").write_bytes(b"synthetic attachment")
            (source/"link").symlink_to("object")
            components.archive_sources(root/"archive.tar",{"storage":source},{"synthetic":True})
            with tarfile.open(root/"archive.tar") as archive:
                self.assertEqual(archive.extractfile("storage/object").read(),b"synthetic attachment")
                self.assertTrue(archive.getmember("storage/link").issym())
    def test_archive_rejects_special_files(self):
        with tempfile.TemporaryDirectory() as name:
            p=Path(name);os.mkfifo(p/"fifo")
            with self.assertRaisesRegex(r.Rejected,"SPECIAL"): components.tree_manifest(p)
    def test_mutation_rejects_archive(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name);os.chmod(root,0o700);source=root/"source";source.mkdir()
            with patch.object(components,"tree_manifest",side_effect=[[],[{"changed":True}]]):
                with self.assertRaisesRegex(r.Rejected,"SOURCE_CHANGED"):
                    components.archive_sources(root/"archive.tar",{"storage":source},{})
    def test_custody_plan_is_not_archive_receipt(self):
        with patch.object(r,"verify",return_value={}):
            with self.assertRaisesRegex(r.Rejected,"FIELDS"):
                components.custody("/unused","a"*64,{"status":"PLANNED_NOT_CAPTURED"})
    def test_custody_false_confirmation_rejected(self):
        value=dict(manifestSha256="a"*64,location="owner-independent-Mac",
                   verifiedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                   allChecksumsMatch=False,independentHost=True,attestedBy="fixture")
        with patch.object(r,"verify",return_value={}):
            with self.assertRaisesRegex(r.Rejected,"NOT_CONFIRMED"):
                components.custody("/unused","a"*64,value)

class IsolationTests(unittest.TestCase):
    def setUp(self):
        self.digest="a"*64
        self.name="uvanoo-restore-"+"b"*32
        self.receipt=dict(container=self.name,manifestSha256=self.digest,archiveRestore="PASS",
                          workDirectory="/private/new-restore")
        self.container={"Id":"c"*64,"Image":"pinned","State":{"Running":True},
                        "HostConfig":{"NetworkMode":"none","PortBindings":{},"Privileged":False},
                        "Config":{"Labels":{"uvanoo.recovery":"disposable","uvanoo.manifest":self.digest}},
                        "Mounts":[{"Source":"/private/new-restore/pgdata",
                                   "Destination":"/var/lib/postgresql/data"}]}
    def inspect(self,args):
        return [{"Id":"pinned"}] if args[1]=="image" else [self.container]
    def test_isolated_target_accepted(self):
        self.assertEqual(isolated.target(self.receipt,self.digest,self.inspect),"c"*64)
    def test_persistent_name_rejected(self):
        self.receipt["container"]="uvanoo-dev-postgres"
        with self.assertRaisesRegex(r.Rejected,"ISOLATED_NAME"):
            isolated.target(self.receipt,self.digest,self.inspect)
    def test_networked_restore_rejected(self):
        self.container["HostConfig"]["NetworkMode"]="bridge"
        with self.assertRaisesRegex(r.Rejected,"ISOLATION"):
            isolated.target(self.receipt,self.digest,self.inspect)
    def test_persistent_volume_rejected(self):
        self.container["Mounts"][0]["Source"]="/var/lib/docker/volumes/uvanoo-dev-postgres-data/_data"
        with self.assertRaisesRegex(r.Rejected,"ISOLATION"):
            isolated.target(self.receipt,self.digest,self.inspect)
    def test_other_manifest_rejected(self):
        self.container["Config"]["Labels"]["uvanoo.manifest"]="d"*64
        with self.assertRaisesRegex(r.Rejected,"ISOLATION"):
            isolated.target(self.receipt,self.digest,self.inspect)
    def test_mutable_rehearsal_image_rejected(self):
        with self.assertRaisesRegex(r.Rejected,"IMMUTABLE"):
            isolated.migration_binding({},"node:24")
    def test_wrong_source_image_evidence_rejected(self):
        with self.assertRaisesRegex(r.Rejected,"SOURCE_IMAGE"):
            isolated.migration_binding({},"example/image@sha256:"+"a"*64)
    def test_no_fabricated_restore_url(self):
        evidence=dict(sourceSha=isolated.PRODUCT,sourceTree=isolated.TREE,
                      imageDigest="sha256:"+"a"*64,version=1,
                      schemas={"58":isolated.CANONICAL58},backup={"restoreRun":"local-unverified"})
        with self.assertRaisesRegex(r.Rejected,"GATE_EVIDENCE"):
            isolated.migration_binding(evidence,"example/image@sha256:"+"a"*64)

if __name__ == "__main__": unittest.main()

import json
import subprocess
import unittest
import diagnose_prefence as d
from test_backup_adapters import services

class DiagnosticTests(unittest.TestCase):
    def test_missing_object_redacts_error_and_arguments(self):
        def run(*a,**k):
            return subprocess.CompletedProcess(a[0],1,b"",b"No such object: PRIVATE_SECRET")
        out,data=d.call("CONTAINER_INSPECT",["docker","inspect","PRIVATE_SECRET"],run)
        self.assertEqual(out["errorClass"],"MISSING_OBJECT")
        self.assertNotIn("PRIVATE_SECRET",json.dumps(out))
        self.assertIsNone(data)

    def test_unknown_failure_never_prints_raw_stderr(self):
        def run(*a,**k):
            return subprocess.CompletedProcess(a[0],9,b"secret stdout",b"secret stderr")
        out,_=d.call("PG_IMAGE_INSPECT",[],run)
        self.assertEqual(out["exitCode"],9)
        self.assertEqual(out["errorClass"],"OTHER")
        self.assertNotIn("secret",json.dumps(out))

    def test_timeout_is_classified(self):
        def run(*a,**k): raise subprocess.TimeoutExpired("secret",30)
        out,_=d.call("CONTAINER_LIST",[],run)
        self.assertEqual(out,{"stage":"CONTAINER_LIST","status":"EXECUTION_FAILED"})

    def test_invalid_json_not_leaked(self):
        def run(*a,**k): return subprocess.CompletedProcess([],0,b"private invalid json",b"")
        out,_=d.call("PG_CONTAINER_INSPECT",[],run)
        self.assertEqual(out["status"],"INVALID_OUTPUT")
        self.assertNotIn("private",json.dumps(out))

    def test_spec_compare_has_no_private_config(self):
        base=services()
        out=d.compare_services(base,services())
        self.assertTrue(all(x["specEqual"] and x["versionEqual"] for x in out))
        self.assertNotIn("SECRET",json.dumps(out))

    def test_changed_replica_and_version_are_reported(self):
        live=services()
        live["web"]["Spec"]["Mode"]["Replicated"]["Replicas"]=0
        live["web"]["Version"]["Index"]=11
        out=next(x for x in d.compare_services(services(),live) if x["role"]=="web")
        self.assertFalse(out["specEqual"])
        self.assertFalse(out["versionEqual"])

if __name__=="__main__": unittest.main()

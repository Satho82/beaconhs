import json
import unittest
from check_recovery_watchdog import observe, STACK, ROLES

class WatchdogTests(unittest.TestCase):
    def fixture(self):
        services = [{"ID": r, "Spec": {"Name": STACK+"_"+r,
                    "Mode": {"Replicated": {"Replicas": 0}}}} for r in ROLES]
        tasks = [{"ID": r+"-task", "ServiceID": r,
                  "DesiredState": "shutdown", "Status": {"State": "shutdown"}} for r in ROLES]
        infra = [{"Name": "/uvanoo-dev-"+n, "State": {"Running": True,
                  "Health": {"Status": "healthy"}}} for n in ("postgres","minio","redis")]
        return services, tasks, infra
    def run_fixture(self, values):
        services, tasks, infra = values
        def run(args):
            self.assertNotIn("--filter", args)
            if args[1:3] == ["service","inspect"]: return json.dumps(services)
            if args[1:3] == ["service","ps"]: return args[-1]+"-task"
            if args[1] == "inspect":
                return json.dumps(infra if "uvanoo-dev-postgres" in args else tasks)
            self.fail("unexpected command")
        return observe(run)
    def test_complete_zero_fence(self):
        self.assertEqual(self.run_fixture(self.fixture())["activeTasks"],0)
    def test_running_task_with_shutdown_desired_is_rejected(self):
        values=self.fixture();values[1][0]["Status"]["State"]="running"
        with self.assertRaises(ValueError): self.run_fixture(values)
    def test_unknown_task_state_is_rejected(self):
        values=self.fixture();values[1][0]["Status"]["State"]="unknown"
        with self.assertRaises(ValueError): self.run_fixture(values)
    def test_missing_task_observation_is_rejected(self):
        values=self.fixture();values[1].pop()
        with self.assertRaises(ValueError): self.run_fixture(values)
    def test_collabora_must_be_stopped(self):
        values=self.fixture();values[0][-1]["Spec"]["Mode"]["Replicated"]["Replicas"]=1
        with self.assertRaises(ValueError): self.run_fixture(values)
    def test_missing_service_is_rejected(self):
        values=self.fixture();values[0].pop()
        with self.assertRaises(ValueError): self.run_fixture(values)
    def test_unhealthy_infra_is_rejected(self):
        values=self.fixture();values[2][-1]["State"]["Health"]["Status"]="unhealthy"
        with self.assertRaises(ValueError): self.run_fixture(values)
    def test_observer_failure_is_rejected(self):
        with self.assertRaises(RuntimeError):
            observe(lambda _: (_ for _ in ()).throw(RuntimeError("unavailable")))

if __name__ == "__main__": unittest.main()

#!/usr/bin/env python3
import unittest
from activate_admitted_web import handoff

class IO:
    def __init__(self,fail=None):self.events=[];self.fail=fail
    def step(self,name):
        self.events.append(name)
        if self.fail==name:raise RuntimeError("injected")
    def admit(self):self.step("admit")
    def stop_watchdog(self):self.step("stop-watchdog")
    def stop_monitor(self):self.step("stop-monitor")
    def activate_web(self):self.step("activate-web")
    def fence(self):self.step("fence")
    def record(self,status):self.events.append(status)

class Handoff(unittest.TestCase):
    def test_admission_precedes_every_mutation(self):
        io=IO();handoff(io)
        self.assertEqual(io.events,["admit","admission-passed","stop-watchdog","stop-monitor","maintenance-monitoring-ended","activate-web","web-activated-public-fence-retained"])
    def test_rejected_admission_changes_nothing(self):
        io=IO("admit")
        with self.assertRaises(RuntimeError):handoff(io)
        self.assertEqual(io.events,["admit"])
    def test_stop_failure_never_activates(self):
        io=IO("stop-monitor")
        with self.assertRaises(RuntimeError):handoff(io)
        self.assertNotIn("activate-web",io.events)
        self.assertEqual(io.events[-2:],["fence","activation-failed-writers-refenced"])
    def test_activation_failure_refences(self):
        io=IO("activate-web")
        with self.assertRaises(RuntimeError):handoff(io)
        self.assertEqual(io.events[-2:],["fence","activation-failed-writers-refenced"])
    def test_failed_refence_is_not_claimed_safe(self):
        class Broken(IO):
            def fence(self):raise RuntimeError("fence")
        io=Broken("activate-web")
        with self.assertRaises(RuntimeError):handoff(io)
        self.assertEqual(io.events[-1],"activation-failed-fence-unconfirmed")

if __name__=="__main__":unittest.main()

import copy
import datetime as dt
import unittest
from observe_collabora_interval import validate_samples

class IntervalTests(unittest.TestCase):
    def samples(self):
        start = dt.datetime(2026, 10, 29, tzinfo=dt.timezone.utc)
        return [{"version": 1, "status": "OBSERVED", "target": "https://dev.uvanoo.com",
                 "sourceSha": "a"*40, "epoch": "b"*64, "historicalSaveState": "UNKNOWN",
                 "drainageProven": False, "taskCoverageSha256": "c"*64,
                 "collaboraTasks": 1, "webTasks": 1, "activeSessions": 0, "activeDocuments": 0,
                 "inFlight": 0, "failedSaves": 0, "unknownOutcomes": 0,
                 "eventCount": 0, "completedSaves": 0, "completionWatermark": "d"*64,
                 "observedAt": (start+dt.timedelta(seconds=i*5)).isoformat()} for i in range(13)]

    def test_fresh_interval_does_not_claim_historical_or_release_proof(self):
        r = validate_samples(self.samples(), "a"*40, "b"*64)
        self.assertTrue(r["newIntervalObserved"])
        self.assertFalse(r["historicalCoverageVerified"])
        self.assertFalse(r["releaseAdmitted"])

    def test_missing_samples_and_short_intervals_fail(self):
        for v in [[], self.samples()[:1], self.samples()[1:], self.samples()[:5]+self.samples()[6:]]:
            with self.assertRaises((ValueError, IndexError)):
                validate_samples(v, "a"*40, "b"*64)

    def test_new_uncertainty_activity_and_task_or_source_drift_fail(self):
        for field, value in [("sourceSha", "e"*40), ("epoch", "e"*64),
                             ("taskCoverageSha256", "e"*64), ("activeSessions", 1),
                             ("activeDocuments", 1), ("inFlight", 1), ("failedSaves", 1),
                             ("unknownOutcomes", 1), ("historicalSaveState", "VERIFIED"),
                             ("status", "UNKNOWN"), ("webTasks", 0), ("drainageProven", True)]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                samples = self.samples(); samples[6][field] = value
                validate_samples(samples, "a"*40, "b"*64)

    def test_ledger_regression_or_replacement_fails(self):
        samples = self.samples()
        samples[5]["eventCount"] = 3
        with self.assertRaises(ValueError): validate_samples(samples, "a"*40, "b"*64)
        samples = self.samples(); samples[6]["completionWatermark"] = "e"*64
        with self.assertRaises(ValueError): validate_samples(samples, "a"*40, "b"*64)

if __name__ == "__main__":
    unittest.main()

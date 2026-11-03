import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fixture_verifier', Path(__file__).with_name('verify-fixture-session.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class VerifyFixtureSessionTests(unittest.TestCase):
    def test_only_pinned_fixture_and_manifest_can_reach_read_only_query(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / 'identities.json'
            pin = Path(directory) / 'identities.sha256'
            email = 'dev-release-smoke@uvanoo.invalid'
            manifest.write_text(json.dumps({'fixture-id': email}))
            pin.write_text(hashlib.sha256(manifest.read_bytes()).hexdigest())
            with patch.object(module, 'MANIFEST', manifest), patch.object(module, 'PIN', pin), \
                 patch.object(module, 'secure', return_value=True), patch.object(module.subprocess, 'run') as run:
                run.return_value.stdout = 'PASS\n'
                self.assertTrue(module.verify('fixture-id', 'session-id', email))
                self.assertFalse(module.verify('unknown-id', 'session-id', email))
                self.assertFalse(module.verify('fixture-id', 'session-id', 'different@uvanoo.invalid'))
                self.assertFalse(module.verify('bad;sql', 'session-id', email))
                manifest.write_text(json.dumps({'fixture-id': email, 'other': email}))
                self.assertFalse(module.verify('fixture-id', 'session-id', email))
                self.assertEqual(run.call_count, 1)


if __name__ == '__main__':
    unittest.main()

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from read_dev_dokploy_token import read_token

class PrivateTokenTests(unittest.TestCase):
    def test_private_token_and_trailing_newline(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/"token"; p.write_text("synthetic-token\n");p.chmod(0o600)
            self.assertEqual(read_token(p), "synthetic-token")

    def test_unsafe_files_fail(self):
        for defect in ["mode", "parent", "symlink", "owner", "newline", "empty"]:
            with self.subTest(defect=defect), tempfile.TemporaryDirectory() as d:
                p=Path(d)/"token";p.write_text("synthetic");p.chmod(0o600)
                if defect == "mode":p.chmod(0o644)
                if defect == "parent":Path(d).chmod(0o755)
                if defect == "symlink":
                    link=Path(d)/"link";link.symlink_to(p);p=link
                if defect == "newline":p.write_text("one\ntwo")
                if defect == "empty":p.write_text("")
                with patch("os.geteuid", return_value=os.geteuid()+1 if defect=="owner" else os.geteuid()):
                    with self.assertRaises(ValueError):read_token(p)

if __name__=="__main__":
    unittest.main()

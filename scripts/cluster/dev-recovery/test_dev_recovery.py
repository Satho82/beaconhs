import datetime as dt
import json
import os
from pathlib import Path
import tempfile
import unittest
import dev_recovery as r

os.umask(0o077)


class RecoveryContract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        os.chmod(self.root, 0o700)
        self.identity = self.root / "identity"
        r.run(["age-keygen", "-o", str(self.identity)])
        self.recipient = self.root / "recipient"
        r.write_new(self.recipient, r.run(["age-keygen", "-y", str(self.identity)]))
        self.ctx = {
            "sourceSha": "a"*40, "sourceTree": "b"*40, "imageDigest": "sha256:"+"c"*64,
            "database": "beaconhs", "databaseOid": 42, "postgresVersion": "160015",
            "ledgerHash": "d"*64, "schemaHash": "e"*64, "dataHash": "f"*64,
            "recipientSha256": __import__("hashlib").sha256(self.recipient.read_text().strip().encode()).hexdigest(),
            "custodyReceiptSha256": "1"*64, "offHostReceiptSha256": "2"*64,
            "fenceGuardSha256": "3"*64, "metadataSqlSha256": "4"*64,
        }
        self.items = []
        for kind in sorted(r.COMPONENTS):
            src = self.root / (kind + ".plain")
            r.write_new(src, ("synthetic " + kind).encode())
            name = "beaconhs.dump.age" if kind == "database" else kind + ".age"
            item = r.encrypt(src, self.recipient, self.root / name)
            self.items.append(dict(item, kind=kind))
        self.started = dt.datetime.now(dt.timezone.utc).isoformat()
        r.write_new(self.root / "capture-start.json", r.canonical({"createdAt": self.started, "context": self.ctx, "databaseSizeBytes": 1000000}))
        r.write_new(self.root / "capture-complete.json", r.canonical({"components": [
            x for x in self.items if x["kind"] in {"database", "metadata"}]}))

    def tearDown(self):
        self.tmp.cleanup()

    def seal(self):
        return r.finalize(self.root, self.ctx, self.items)["sha256"]

    def receipt(self, digest):
        return dict(manifestSha256=digest, restoredAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                    restoreRun="https://github.com/Satho82/beaconhs/actions/runs/123",
                    rollbackImageDigest="sha256:"+"5"*64,
                    **{k: self.ctx[k] for k in ("sourceSha", "sourceTree", "imageDigest",
                                              "ledgerHash", "schemaHash", "dataHash")})

    def test_encrypted_round_trip_and_capture_time_preserved(self):
        digest = self.seal()
        result = r.verify(self.root, digest)
        self.assertEqual(result["createdAt"], self.started)
        dest = self.root / "restored"
        r.decrypt_component(self.root, digest, "database", self.identity, dest)
        self.assertEqual(dest.read_bytes(), b"synthetic database")
        self.assertEqual(dest.stat().st_mode & 0o777, 0o600)

    def test_ciphertext_tamper_rejected(self):
        digest = self.seal()
        with (self.root / "storage.age").open("ab") as f: f.write(b"tamper")
        with self.assertRaisesRegex(r.Rejected, "ARCHIVE_CHECKSUM"): r.verify(self.root, digest)

    def test_manifest_tamper_rejected(self):
        digest = self.seal()
        with (self.root / ("manifest-"+digest+".json")).open("ab") as f: f.write(b" ")
        with self.assertRaisesRegex(r.Rejected, "MANIFEST_CHECKSUM"): r.verify(self.root, digest)

    def test_wrong_identity_rejected(self):
        digest = self.seal()
        wrong = self.root / "wrong"
        r.run(["age-keygen", "-o", str(wrong)])
        with self.assertRaises(r.Rejected):
            r.decrypt_component(self.root, digest, "database", wrong, self.root / "failed-plain")

    def test_no_overwrite(self):
        with self.assertRaises(FileExistsError):
            r.encrypt(self.root/"database.plain", self.recipient, self.root/"beaconhs.dump.age")

    def test_missing_component_rejected(self):
        with self.assertRaisesRegex(r.Rejected, "INCOMPLETE"): r.finalize(self.root, self.ctx, self.items[:-1])

    def test_path_traversal_rejected(self):
        self.items[0]["file"] = "../outside.age"
        with self.assertRaisesRegex(r.Rejected, "ARCHIVE_NAME"): r.finalize(self.root, self.ctx, self.items)

    def test_symlink_rejected(self):
        link = self.root/"link"
        link.symlink_to(self.identity)
        with self.assertRaisesRegex(r.Rejected, "SYMLINK"): r.private(link)

    def test_world_readable_identity_rejected(self):
        os.chmod(self.identity, 0o644)
        with self.assertRaisesRegex(r.Rejected, "PRIVATE_PERMISSION"): r.private(self.identity)

    def test_unapproved_pg_profile_rejected(self):
        self.ctx["database"] = "staging"
        with self.assertRaisesRegex(r.Rejected, "DATABASE_IDENTITY"): self.seal()

    def test_source_and_digest_shape_rejected(self):
        self.ctx["imageDigest"] = "latest"
        with self.assertRaisesRegex(r.Rejected, "IMAGE_IDENTITY"): self.seal()

    def test_multiline_metadata_documents(self):
        docs = [{"section":"identity","database":"beaconhs","postgresVersion":"160015"},
                {"section":"ledger","rows":[]}] + [{"section":i,"rows":[]} for i in range(19)]
        text = "\n".join(json.dumps(d,indent=2) for d in docs)
        self.assertEqual(r.parse_documents(text), docs)
        with self.assertRaises(r.Rejected): r.parse_documents(text[:-1])
        with self.assertRaises(r.Rejected): r.parse_documents(text+"trailing garbage")
        docs[-1]["section"] = 17
        with self.assertRaises(r.Rejected): r.parse_documents("\n".join(json.dumps(d) for d in docs))

    def test_capture_binding_rejected(self):
        self.ctx["sourceSha"] = "9"*40
        with self.assertRaisesRegex(r.Rejected, "CAPTURE_CONTEXT"): self.seal()

    def test_capture_components_cannot_be_replaced(self):
        self.items[0]["kind"], self.items[1]["kind"] = self.items[1]["kind"], self.items[0]["kind"]
        with self.assertRaisesRegex(r.Rejected, "CAPTURE_COMPONENT"): self.seal()

    def test_gate_fragment_matches_receipt(self):
        digest = self.seal()
        out = r.gate_fragment(self.root, digest, self.receipt(digest))
        self.assertEqual(out["file"], "beaconhs.dump.age")
        self.assertEqual(out["restoredSchemaHash"], self.ctx["schemaHash"])

    def test_stale_backup_cannot_be_refreshed_by_restore(self):
        digest = self.seal()
        receipt = self.receipt(digest)
        future = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=2)
        with self.assertRaisesRegex(r.Rejected, "FRESH_RESTORE"): r.gate_fragment(self.root, digest, receipt, future)

    def test_wrong_restore_source_rejected(self):
        digest = self.seal()
        receipt = self.receipt(digest)
        receipt["sourceSha"] = "9"*40
        with self.assertRaisesRegex(r.Rejected, "RESTORE_BINDING"): r.gate_fragment(self.root, digest, receipt)

    def test_wrong_restore_data_rejected(self):
        digest = self.seal()
        receipt = self.receipt(digest)
        receipt["dataHash"] = "9"*64
        with self.assertRaisesRegex(r.Rejected, "RESTORE_BINDING"): r.gate_fragment(self.root, digest, receipt)

    def test_wrong_restore_run_rejected(self):
        digest = self.seal()
        receipt = self.receipt(digest)
        receipt["restoreRun"] = "https://example.org/unverified"
        with self.assertRaisesRegex(r.Rejected, "RESTORE_RUN"): r.gate_fragment(self.root, digest, receipt)

    def test_copy_checksum_is_not_offhost_attestation(self):
        digest = self.seal()
        import shutil
        copy = self.root/"copy"
        shutil.copytree(self.root, copy, ignore=shutil.ignore_patterns("copy"))
        os.chmod(copy, 0o700)
        out = r.compare_copies(self.root, copy, digest)
        self.assertTrue(out["allCiphertextChecksumsMatch"])
        self.assertIn("MUST_BE_VERIFIED", out["offHostIndependence"])

    def test_duplicate_restore_operation_rejected_before_container_start(self):
        import restore_disposable
        digest = self.seal()
        roles = self.root/"roles.sql"
        r.write_new(roles, b"-- reviewed disposable role contract\n")
        (self.root/(".restore-"+digest+".lock")).mkdir(mode=0o700)
        with self.assertRaises(FileExistsError):
            restore_disposable.restore(self.root, digest, self.identity, self.root, roles, r.sha(roles))

    def test_capture_requires_approved_collector_before_connection(self):
        collector = self.root/"collector.sql"
        r.write_new(collector, b"SELECT 1;\n")
        from unittest.mock import patch
        with patch.dict(os.environ, {"PGDATABASE":"beaconhs","PGUSER":"beaconhs_backup",
                                     "PGHOST":"test","PGPORT":"5432"}):
            with self.assertRaisesRegex(r.Rejected, "COLLECTOR_IDENTITY"):
                r.capture_pg(self.root,self.recipient,self.ctx,self.root/"guard",collector)

    def test_fence_guard_hash_rejected(self):
        guard = self.root/"guard"
        r.write_new(guard, b"#!/bin/sh\nexit 0\n")
        os.chmod(guard, 0o700)
        with self.assertRaisesRegex(r.Rejected, "FENCE_GUARD_IDENTITY"):
            r.guard(guard, "0"*64)

    def test_fence_guard_failure_rejected(self):
        guard = self.root/"guard"
        r.write_new(guard, b"#!/bin/sh\nexit 1\n")
        os.chmod(guard, 0o700)
        with self.assertRaisesRegex(r.Rejected, "TOOL_EXIT"):
            r.guard(guard, r.sha(guard))


if __name__ == "__main__":
    unittest.main()

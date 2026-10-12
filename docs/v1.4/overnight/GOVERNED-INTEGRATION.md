# Governed integration procedure

Draft PR https://github.com/Satho82/beaconhs/pull/9.
Head 563fb0e9b79a838a5f394abaffb2f7dc743fc571; tree 324c50a60e2cb0639ba920488a150c6531968374; base d18f635a41f092e9e86aa6f53518f9c28992b0d2. GitHub reports mergeable/clean. 96 changed files; no original migration SQL edits, People/Risk runtime changes or extra overnight harness files in this PR.

No merge is authorized tonight. Opening this PR against feature/uvanoo-v1.4 does not match existing main-only pull_request CI/deployment triggers. Overnight workflows reside only on the separate review branch.

When owner explicitly approves:
1. Re-read PR head/base, branch activity, full diff and workflow triggers. Reject stale heads or unexpected writes. Preserve no-force policy.
2. Confirm acceptance/freeze prerequisites and security reconciliation. Bind exact approved head SHA; do not merge an automatically updated branch.
3. Use an ordinary merge preserving parents/history, with expected head SHA 563fb0e9b79a838a5f394abaffb2f7dc743fc571; no squash/rebase unless separately reviewed. If base is unchanged, resulting product tree must equal 324c50a60e2cb0639ba920488a150c6531968374. The new merge commit SHA will differ and must be recorded.
4. Feature push triggers Fast DEV and authoritative uvanoo-v1.4-cloud-build.yml validation/image publication. It does not automatically deploy DEV. Do not trigger main CI/workflow_dispatch, whose deployment behaviour differs.
5. Wait for authoritative validation and image jobs for that exact governed head. Verify immutable digest and OCI revision/source labels. Prior isolated tests cannot substitute for a changed merge SHA's workflow authority.
6. Re-bind backup/restore evidence and manifest checksum to the actual merge source/tree/image. Manual DEV dispatcher remains a separate explicit approval and must satisfy current-head, image, backup, schema/security and data gates.

Any conflict or divergence requires a new isolated review; never resolve by replacing protected migration/Risk/People bytes. No automated merge or deployment task is configured here.

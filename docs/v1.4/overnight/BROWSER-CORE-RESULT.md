# Core authenticated browser result

Run 38318803277 / job 115041711515 / control bd95386cdd0eb1e5524f7ef4cbda6a2af81e4adb: **35 checks PASS**, 30 real screenshots, zero captured page errors. Product remains 563fb0e9b79a838a5f394abaffb2f7dc743fc571 / tree 324c50a60e2cb0639ba920488a150c6531968374.

All six password sign-ins returned HTTP 200 on first attempt with production authentication and TLS enforced. Login spacing changed only in the harness. Earlier rejected logins lacked status capture, so rate limiting remains a plausible explanation, not a retrospectively verified HTTP 429.

After normal tour dismissal, UI workflow setup and all dependent Approvals flows passed. Full per-check report is browser-run-38318803277.json. Artifact 11777954723 (ZIP SHA256 5d1c96dfa2d043a0ebaca8c6cc07f7a4ad338b8823cf1801415bd115dca1593c) retains screenshots, sanitized server logs, migration hashes and source identity.

Verified: six-role People and Approvals navigation; Cluster GM profiles across both hotels; restricted foreign-person denial; two-stage workflow with GBP limits; financial request and PDF upload/download; over-limit rejection; restricted foreign request denial; comments; information request/resubmission; manual reminder/audit; sequential approval; requester cancellation; delegation/original-stage history; CSV reporting; notification-page access; mobile no-overflow.

Not claimed: actual property-assignment mutation or menu-toggle interactions (focused continuation follows), automatic reminder timing or actual recipient notification/email delivery in the browser, full visual fidelity. Prior integration evidence remains separate. No runtime files, permissions or security guards were changed.

Visual inspection of earlier run 38318154918 found splash/tour captures; these cannot substantiate design acceptance. Focused continuation explicitly waits for the existing splash to finish before screenshots.

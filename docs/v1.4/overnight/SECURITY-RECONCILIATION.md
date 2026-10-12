# Supplemental source scan reconciliation

Candidate: 563fb0e9b79a838a5f394abaffb2f7dc743fc571 / 324c50a60e2cb0639ba920488a150c6531968374.

Status: **RECONCILED — THREE FALSE POSITIVES**. Original raw scans [38314216302](https://github.com/Satho82/beaconhs/actions/runs/38314216302) and [38314349634](https://github.com/Satho82/beaconhs/actions/runs/38314349634) remain failed and retained. The latter prints only rule, path and line metadata. Review did not expose credentials or change scan configuration.

1. `apps/web/src/lib/property-delegation.integration.test.ts:89`, generic-api-key, blob `b7df48dfbfdcb7d1e397861dc201ba5f6089e902`: The flagged key is a synthetic database RBAC role identifier in a disposable property-delegation test; it is not used for authentication or external access. Byte-identical to governed base d18f635a41f092e9e86aa6f53518f9c28992b0d2.

2. `docs/UVANOO_V12_INTEGRATION.md:28`, generic-api-key, blob `df070dd07c3c4b87dfbc9d91284b415a9ac4060a`: The flagged location is a Markdown requirements/architecture table row containing ordinary product prose, with no credential assignment or authentication use. Byte-identical to governed base d18f635a41f092e9e86aa6f53518f9c28992b0d2.

3. `docs/v1.4/V1.4_ARCHITECTURE_DECISIONS.md:141`, generic-api-key, blob `e6afb779500d37f13a68046c019d58ee931e3be9`: The flagged location is a Markdown requirements/architecture table row containing ordinary product prose, with no credential assignment or authentication use. Byte-identical to governed base d18f635a41f092e9e86aa6f53518f9c28992b0d2.

This is documented triage, not a green raw scan or a security waiver. No broad exclusions, rule disablement, credential rotation, or runtime modifications were performed. Apply this disposition only to these exact immutable locations. New or changed matches must fail closed and be reviewed independently. The existing incremental Gitleaks and CodeQL security-extended jobs passed in run 38313918871; CodeQL analysis/upload success alone is not a claim of zero alerts.

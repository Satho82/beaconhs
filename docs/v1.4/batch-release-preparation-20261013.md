# Uvanoo V1.4 first batch: recovery and release preparation

Status: PREPARATION CHECKPOINT — NOT DEPLOYMENT READY.
Scope: existing Risk Assessments, People and Approvals only. No new module development.

## Immutable identities and reused evidence

- Validated product: 563fb0e9b79a838a5f394abaffb2f7dc743fc571
- Product tree: 324c50a60e2cb0639ba920488a150c6531968374
- Governed feature/uvanoo-v1.4 remains d18f635a41f092e9e86aa6f53518f9c28992b0d2
- Draft PR9 remains open, clean/mergeable and unchanged.
- Full combined validation 38313918871 remains successful: repository/module/migration gates, production web/worker build, CodeQL and Gitleaks jobs.
- Browser evidence reused from 2d5ec5246d61ef35ac86af308399cde1fd9f0cfa: core 35/35 in 38318803277; final focused 6/6 in 38320812403. Earlier partly failing runs are not relabelled green.
- All 63 historical SQL identities preserved; includes 0000 and historical absence of 0033. No renumbering.
- Branch inventory: 49 branches inspected. No in-progress Actions at closeout. External non-Actions worker activity is NOT VERIFIED; no task-inventory connector is exposed.

## A. Database reconciliation

Evidence checkpoint: de8eb36d0031663a617ebd0ad941229077fc16a5
Successful disposable PostgreSQL16.15 run: https://github.com/Satho82/beaconhs/actions/runs/38372116422

Extension ownership is technically explained by the DEV bootstrap profile:
- Live uvanoo_dev is role OID10 with bootstrap superuser attributes; no role memberships.
- DEV infrastructure Compose explicitly names POSTGRES_USER=uvanoo_dev.
- Canonical local-init accepts POSTGRES_USER; provisioning requires a superuser, not a universally fixed role name.
- Extension member inventory hash matches the independently created disposable profile:
  247daafda48d1a86c9543675a4310152df378a6332819f92295cd70cf2d67a54.
- All 67 public extension functions and gtrgm ownership/dependencies are accounted for; _gtrgm has the expected internal dependency.
- Runtime service DB login roles remain beaconhs_app / beaconhs_super, not uvanoo_dev.
- No explicit original owner approval for this bootstrap-name variation was recovered. Approve this evidenced profile before using its reference in a release manifest. Do not rename/reassign extension ownership.

Independent proposed DEV-profile canonical58 fingerprint:
730d95c22ad6914d68bcdbea46283741f24ebd21a5f609c7951a4e5f72392a7c

Unchanged observed DEV snapshot fingerprint:
0529262d8f4b1a323994e1dbeae85e70b3506cd0746c2faf3d0b4e014ccb0074

58/58 ledger identities pass. 18/19 sections match this proposed profile. The sole remaining section is default ACLs: two additional beaconhs_owner/public records granting future-table CRUD and future-sequence USAGE/SELECT/UPDATE to app/super, plus backup SELECT.

Independent disposable test:
1. Build full historical provision + runner + RLS, first58 only.
2. Add four historical provision.sql default GRANT statements; resulting fingerprint exactly reproduces DEV's observed hash.
3. Apply only two proposed default-ACL REVOKE statements under canonical transaction advisory lock.
4. All19 sections return to the independently generated canonical hash; ledger unchanged.
5. Deliberate transaction rollback restores the pre-correction fixture fingerprint.

Proposal SQL SHA256:
7262d5c6a52d5c57f1888837eabb44e3b29fa43f253ccc1086f888d46fbe9d54
Path: docs/v1.4/drift-resolution58-validation/proposed-default-acl-correction.sql in de8eb36.

This proposal changes only future-object defaults. Existing object ACLs, RLS, Risk/People/Approvals runtime and historical SQL remain untouched. No live correction occurred. The migration gate was not changed or bypassed.

## B. Backup/storage/queue evidence

Live bounded read-only checks:
- PostgreSQL16.15, beaconhs, 58 ledger records.
- 5 properties, 968 operational lifecycle events, 2 tenants, 2 attachments.
- Backup role: canonical flags, no detected missing SELECT/elevated table or sequence rights across public/drizzle/etl; zero owned relations. This is catalogue evidence, not an authenticated backup/restore proof.
- Permanent PostgreSQL/Redis are healthy and attached to uvanoo-dev-runtime; no host port publication for5432/6379.
- Permanent Redis INFO keyspace and SCAN found zero keys. No job payloads read or jobs processed.
- clean155 Redis persistence volume and Decision149/154/155 recovery volumes remain present, untouched. Their full content divergence/queue disposition is NOT VERIFIED.
- Already-running decision155 inspection container was observed, but PostgreSQL socket access was unavailable. It was not started/restarted by this controller.
- No DEV MinIO container was found. Its retained volume contains36 files/231965 bytes. Two attachment references exist; object-key/checksum correspondence and bucket privacy are NOT VERIFIED.
- Existing older dump /opt/uvanoo-dev/backups/beaconhs-pre-uvanoo-dev-runtime-20261004T172312Z.dump is1582640 bytes. No current encrypted backup/restore evidence was found in the bounded searched roots.
- age exists on VPS. Host pg_dump/pg_restore were not found on PATH; use approved PG16.15 tooling after authorisation.
- About28.5GB available disk; shared-host pruning is unnecessary for the existing2GiB threshold.

A later elevated command to hash routing/older-backup files and inventory clean155 Redis persistence files was rejected by Remote Desktop Commander as 'Command not allowed' without a detailed reason. Those extra checks remain NOT VERIFIED; no bypass attempted.

## C. Actual-data rehearsal

NOT EXECUTED. Current authorisation explicitly excludes persistent backups and writer fencing. No actual DEV data was copied into a rehearsal cluster.
Synthetic canonical tests do not establish actual Risk backfill, revision-constraint, People provenance, attachment or tenant-data migration safety.

Required authorised sequence:
1. Validate control-plane saved compose, target and WRITER_REPLICAS fence capability. Initial live fenceability is NOT VERIFIED.
2. Fence all writer sources, including external integrations/direct clients, and verify zero active writers. Preserve current image/config/volume identities.
3. Capture a protected encrypted pre-correction database backup plus storage/Redis recovery evidence, using beaconhs_backup and approved age recipient/key custody. Raw backups/metadata never enter public GitHub.
4. Restore privately into isolated PostgreSQL16.15 with the approved bootstrap profile. Repository dumps omit owner/ACLs: reconstruct the reviewed ownership/ACL contract and verify all data, ledger, schema, sequences and security; backup.sh/restore-verify.sh alone are insufficient full-gate evidence.
5. Apply the two-statement correction on the isolated copy; verify canonical58. Rehearse0059–0063 with exact source, locks, atomic failure/rollback, retry/idempotence, Risk constraints/backfills, People scope, Approvals security, attachment links and complete data preservation.
6. Only after separate approval of that evidence, apply the same narrow live correction in one locked transaction with exact before/after hashes. Never rerun broad provision.sql on DEV.
7. Keep the pre-correction archive for recovery. Create and independently restore a fresh POST-correction backup for the migration gate: its backup.schemaHash must equal the current canonical58 state. The earlier uncorrected backup cannot satisfy this equality.
8. Generate the independent63-entry PostgreSQL16.15 target profile, final source/tree/image binding, current/restored ledger/data/schema hashes and rollback image compatibility. The approved ReleaseEvidence manifest and restore evidence must be within the gate's one-hour window.
9. Do not revert ledger rows or attempt SQL down-migrations. On failure retain fence, evidence and all originals. A restore/switchover requires its own explicit approved target/scope.

No actual backup archive, restore run or final release-manifest digest is claimed by this checkpoint.

## D. Governed integration and safety proposal

PR9: https://github.com/Satho82/beaconhs/pull/9
No governed merge occurred. Recheck exact base/head immediately before any approved ordinary history-preserving merge. Merge into feature/uvanoo-v1.4 only; never main.

A separately reviewed DEV-tooling correction is draft PR10:
https://github.com/Satho82/beaconhs/pull/10
Head b11778aee65e3a6818fed58d4927070165746e1b
Tree eca775c1c6cd162b659e15eee4c3ef52d4a0e978
Target: isolated integration branch. PR10 is clean/mergeable at inspection; PR9 remains unchanged.

Changes:
- Native public login200 with no Basic challenge.
- Unauthenticated /hospitality/risk, /people, /approvals must redirect to same-origin/login.
- Final failure/cancellation re-fence through the canonical DEV helper.
- Skip shared-host pruning and shared Collabora branding writes for verified DEV candidates; normal-main behaviour unchanged.

Focused validation38373723297 passed: formatting, syntax,59 unique readiness/fence tests, existing candidate deployment contract and new safety contract. The prior formatting failure38373432836 is preserved. Product runtime, all migration SQL and migration-gate files are unchanged.

IMPORTANT unresolved sequencing requirement:
The current canonical helper restores web, worker and scheduler together before external readiness. PR10 adds containment but does not certify readiness-before-writer-release. A reviewed controlled probe/activation sequence must be implemented and tested before deployment; do not treat PR10 alone as a complete deploy-ready candidate. Hard runner termination can also prevent an Actions cleanup step: the recovery procedure must independently verify/re-establish the persisted fence.

AGENTS.md rule8 requires full release validation before candidate acceptance/deployment/freeze. PR10 has focused evidence only and is a draft proposal. Preserve original passing module evidence; run mandatory full release/security validation on the final integrated exact source, rather than publishing an interim deployment image that will be superseded.

## E. Image identity and publication

Currently configured/deployed old image:
ghcr.io/satho82/uvanoo-staging-private@sha256:a043f96d8c6b453d9df3e4b38b402963e6e3c0705c4ffb1aed19d6566cdfbec3
OCI revision and APP_VERSION:
6976a851c18e879df1813bb7c18729d6da5ab846

This is not the validated combined candidate. No new release digest was verified or published in this controller. A direct workflow-file API lookup was rejected by connector URL validation; the broader candidate-run lookup returned no rows. Neither is proof that no registry object exists.

After final governed integration approval:
- Merge the reviewed final source, verify exact resulting tree and canonical migrations.
- Let authoritative uvanoo-v1.4-cloud-build.yml validate that exact governed SHA and publish v1.4-dev-<SHA>.
- Verify both authoritative jobs, OCI source/revision/version labels, actual digest and successful pull on the approved execution host.
- Bind the new source/tree/digest to ReleaseEvidence. Existing candidate deployment requires current governed HEAD/caller identity; do not bypass it with a stale candidate.
- This workflow publishes an image but contains no deployment. DEV execution remains separate and manual.

## F–J. DEV deployment and acceptance

NOT DEPLOYED. Web/worker still reference missing clean155 endpoints and are repeatedly recreated by Swarm health handling; desired replica counts are1, not a verified fence.

Proposed endpoint correction, separately approved:
- Runtime/migrator/super/backup URLs: correct dedicated beaconhs roles on uvanoo-dev-postgres:5432/beaconhs.
- Redis: uvanoo-dev-redis:6379 only after queue/data disposition.
- Existing shared DEV overlay already contains PostgreSQL/Redis; runtime DNS/TCP and saved-control-plane configuration still need final preflight.
- Recover DEV-only MinIO from its retained volume and verify the2 attachment references, credentials, private bucket and policy/init side effects before application release. Do not initialise/overwrite an empty replacement.
- Preserve clean155 and other recovery volumes; never flush/copy/replay queues blindly.

Basic Auth is still active: live /login returned401.
The DEV-only file router is /etc/dokploy/traefik/dynamic/uvanoo-dev.yml and references uvanoo-dev-basic-auth. Only its DEV HTTPS router attachment is a proposed removal; retain HTTPS redirects, native authentication, other routers and protected infrastructure. Exact final file checksum/diff must be reverified before approved change. No Traefik change occurred.

Live acceptance remains pending deployment:
- Risk: dashboard/register/forms/review schedule/templates/property isolation/RBAC/RLS/audit.
- People: directory/profiles/roles/property assignment/Cluster GM scope/tenant isolation/audit.
- Approvals: financial limits/documents/stages/decisions/delegation/comments/information requests/cancellation/notifications/reporting/CSV.
- Platform: native login, no Basic popup, unauthenticated route denial, desktop/mobile, teal/coral Light/Terra, both named hotels, no cross-property access and no staging/production impact.
- Record real screenshots. Existing owner acceptance12October remains; People/Approvals are ACCEPTED — FREEZE PENDING for original-reference/branding limitations and pending live release acceptance. Risk runtime and SQL evidence are preserved; this controller does not claim a new live Risk acceptance.
- Automatic reminder timing and actual notification delivery were not covered by the prior browser matrix.

## K. Golden Baseline

NOT READY. Requires successful authorised rollout, exact final SHA/tree/digest, actual63-entry ledger and fingerprint, fresh verified backup/rollback evidence, final endpoints/configuration and real browser/security smoke results. No new modules should start before that baseline exists.

## L. Exact owner approvals

NEXT APPROVAL — does not include migration or deployment:
Approve a DEV-only controlled writer-fenced recovery window for protected encrypted database/storage/Redis backups, private independent PostgreSQL16.15 restore and actual-data0059–0063 rehearsal. Approve recipient/key custody and isolated restore destination. Preserve all existing databases/volumes. Abort on failed fence/identity checks. Keep originals and raw data private.

SEPARATE approvals:
1. Accept the evidenced uvanoo_dev bootstrap profile (no extension-owner changes).
2. After backup/restore/rehearsal evidence, approve exactly the two-statement default-ACL correction and its before/after fingerprint contract.
3. Resolve controlled readiness/activation sequencing and review final safety integration; approve the exact final governed PR head/tree. No automatic governed merge.
4. After fresh post-correction restore evidence and authoritative image publication, approve the final ReleaseEvidence SHA256 and DEV-only endpoints/storage/Traefik/migration/deployment/re-fencing operations. Include a separately identified rollback/restore target; no blanket destructive restore permission.
5. Resolve or explicitly disposition remaining original visual-reference/branding gaps for formal freeze. Existing functional acceptance is preserved, not requested again.

Current task authorises isolated engineering and read-only preflight only for these persistent boundaries. No persistent backup, database correction, migration, Docker/service change, Traefik change, governed merge, deployment, force-push, historical SQL rewrite or new module development was performed.

## M. Checkpoints

- Database proposal: https://github.com/Satho82/beaconhs/commit/de8eb36d0031663a617ebd0ad941229077fc16a5
- Database validation: https://github.com/Satho82/beaconhs/actions/runs/38372116422
- Safety draft PR10: https://github.com/Satho82/beaconhs/pull/10
- Safety focused validation: https://github.com/Satho82/beaconhs/actions/runs/38373723297
- Product integration PR9: https://github.com/Satho82/beaconhs/pull/9
- Use this document's containing commit/tree as the batch recovery checkpoint; it is an evidence branch, not a replacement deployment candidate.

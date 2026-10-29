# DEV telemetry bootstrap — owner authorised 29 October 2026

This amendment accepts possible unsaved changes before the already-authorised
maintenance interruption. Historical save state remains **UNKNOWN**. It never
authorises discarding known unsaved documents or fabricating historical coverage.

## Admission contract

The optional owner-pinned `historicalSaveUncertainty` selects
`collaboraObservedInterval` instead of `collaboraDrainage`. It binds the exact DEV
target, a maintenance hold, the owner decision and bootstrap receipt checksums,
the telemetry epoch and the observation start. The signed safety receipt must
retain the identical uncertainty disclosure. Normal admission is unchanged.

The replacement check requires stopped Collabora tasks, no current sessions,
pending/failed saves or unknown outcomes, complete new-activity coverage, blocked
editing, preserved known documents, task coverage and completion-watermark
commitments. Wrong scope, unbound approvals or incomplete observations fail.
Every other admission check, one-hour backup limit, restore check, nine-object
exception boundary and owner-pinned final approval remains mandatory.

## Reversible bootstrap procedure

This is a separately authorised telemetry bootstrap, not Handover release admission.
Use only the exact DEV compose/stack and the Mac SSH gateway. Never change legacy
or production services. Preserve private original service specifications, saved
compose/environment and recovery evidence before changes.

1. Validate the exact feature head through Full Release and immutable publication.
   Inspect the immutable image's OCI source labels. Verify its migration SQL
   identity and the existing audit-table compatibility; do not run migrations.
2. Retain the existing DEV editor block. Add a higher-priority, DEV-host-only
   maintenance rule blocking public application traffic. Preserve callbacks for
   existing authenticated WOPI saves; verify no new editor admissions.
3. Verify authenticated Collabora counts. If any active document/session or known
   unsaved content exists, preserve and resolve it. Historical UNKNOWN is not
   permission to abandon a currently observed document.
4. Persist and verify the DEV application-writer fence. Preserve documents,
   storage, credentials and infrastructure. Capture an encrypted pre-bootstrap
   database backup with the existing DEV recovery key and verify decryption.
   This capture is not substituted for fresh final release backup/restore evidence.
5. Use the validated immutable candidate for web only with
   `UVANOO_DEV_TELEMETRY_BOOTSTRAP=true` and an explicit expiry at most two hours
   ahead. Bind APP_VERSION/source, exact DEV compose, epoch and observer digest.
   Keep worker/scheduler/storage-init stopped. Keep AutoDeploy off.
   The application gate allows GET health and authenticated telemetry, plus the
   existing capability-authenticated POST /wopi/files/UUID/contents callback.
   All other requests, including prefetched requests, receive maintenance 503.
   Invalid/expired binding fails closed. The entrypoint runs no migrations.
6. Verify unauthorised telemetry denial and every running producer's authenticated
   aggregate output. Bind the private collector source to the actual image.
   Run `observe_collabora_interval.py` with a new private output path:
   it requires at least 60 seconds, stable task/producer identity, no gaps over
   five seconds, no active sessions/documents, pending/failed/unknown saves,
   and no ledger regression. A failure publishes no successful interval receipt.
7. Preserve the interval samples, bootstrap receipt and owner decision privately.
   Stop the bootstrap web and Collabora through the governed saved fence. Verify
   all tasks stopped and the complete no-writer interval. Recheck task identities,
   ledger and storage consistently; a prior interval alone is not admission.
8. Complete independent watchdog review, the source-bound monitor, full storage
   reconciliation, fresh encrypted backup and isolated restore, and final pinned
   owner approval. Only then use the normal governed release workflow.
9. Remove bootstrap variables from active web configuration during approved final
   restoration. Verify Handover, history, tenant isolation and health. Reopen
   editing only after required checks; restore the original Mac command policy.

Rollback before migration preserves the previous immutable image and exact saved
configuration under the maintenance fence. It never deletes data or resets a
ledger. After migration, follow the separately reviewed database recovery plan.

## Evidence limits

The interval collector reports `historicalCoverageVerified=false` and
`releaseAdmitted=false`. Its output must not be wrapped into a successful release
receipt without all other observed gates. No current live acceptance is claimed
by this document or synthetic tests.

DEV candidate deployment reads the approved root-private VPS token through the
same-host helper. No token is uploaded to GitHub secrets or written to workflow
outputs. Ordinary releases retain their existing credential path. A failed local
read has no fallback to the shared credential. The candidate helper requires the
exact DEV compose, stack and host before reading the fixed private token path.

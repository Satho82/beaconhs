# Staging storage initialization (future execution only)

Use the separate MinIO service and volume in `compose.yaml`. Never point these
steps at shared storage. The fixed bucket is `uvanoo-staging-private`.

1. After deployment is separately authorized and staging MinIO is started, use an
   already available, reviewed MinIO administration client from a temporary
   operations environment on the **uvanoo-staging** network. Verify its destination
   resolves to this project's MinIO container, port 9000, and its staging volume.
   Use a fresh client configuration and an alias named `uvanoo-staging-only`.
   Supply only the new staging MinIO root credentials through a protected input;
   do not log credentials, put them in shell history, or reuse a production alias.
2. Using that alias, create the private bucket `uvanoo-staging-private`, set
   anonymous access to none, and import `storage-policy.json` as a new user policy
   named `uvanoo-staging-private-only`. Create a separate staging bucket user and
   attach **only** this policy. Record its credentials outside Git, then place
   them in the staging runtime `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` inputs.
   Do not give runtime containers the root credentials or any other user policy.
3. Later, with infrastructure already running, invoke the existing image role:

   ```sh
   docker compose --env-file /secure/uvanoo-staging.env -p uvanoo-staging -f docker/staging/compose.yaml --profile staging-init run --rm --no-deps uvanoo-staging-storage-init
   ```

   This is an execution instruction, **not a preparation validation command**.
   Require exit status zero and the private-policy/lifecycle/anonymous-probe
   success message. Do not start accepting uploads if it fails.

4. Verify authenticated object put/get/delete and tagged multipart uploads work;
   unsigned reads must be denied (403/404), including at the future browser-facing
   HTTPS endpoint. Verify the bucket user cannot list all buckets, access another
   bucket, create another bucket, or administer users/policies. Do not probe any
   production bucket: use a separate disposable staging-only test bucket later.
   Remove the administrator's temporary client configuration when finished.

The policy deliberately includes bucket creation, policy deletion, lifecycle
read/write, object tagging, and multipart permissions. Source evidence:
`apps/worker/src/storage-init.ts`, `packages/storage/src/index.ts`, and
`apps/web/src/lib/uploads.ts`. The web upload path itself calls `ensureBucket()`;
therefore removing lifecycle/policy permissions after initialization would break
uploads. These privileges are confined to the exact staging bucket. There is no
`PutBucketPolicy`, IAM administration, wildcard bucket resource, or public grant.
Runtime and initialization use the restricted bucket user, never MinIO root.

`ensureBucket()` can create the bucket, deletes any existing bucket policy,
updates lifecycle rules, writes a canary, tests an anonymous GET, and deletes the
canary. Its built-in negative probe alone is insufficient: a 5xx can count as
non-public, so also require a successful signed read and a 403/404 unsigned read.
MinIO uses IAM user policies independently from the deleted bucket policy.

The internal endpoint in the template is deliberately confined to staging.
Browser presigned uploads cannot resolve `uvanoo-staging-minio`. Before browser
smoke testing, choose a distinct staging storage HTTPS hostname and configure
routing to this MinIO service only. Change `R2_ENDPOINT` in both Compose storage
and runtime environments (and the operations env) to that reviewed origin;
verify DNS, certificate, private-object behavior, and CORS for the exact staging
app origin, with upload/download methods and exposed ETag for multipart uploads.
Do not publish MinIO administration or make the bucket public. The internal
network needs a separately reviewed staging-only gateway for this route; do not
attach this template unchanged to production proxy networks. Keep Collabora off.
No shared-R2 alternative is approved by this template.

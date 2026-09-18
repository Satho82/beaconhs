# Uvanoo staging

## Validated staging releases

The feature branch `feature/uvanoo-phase-1-foundation` is validated by
`.github/workflows/uvanoo-validation.yml`. After every validation gate passes,
a separate GitHub-hosted job builds the exact commit for linux/amd64 and publishes
`ghcr.io/satho82/uvanoo-staging-app:<full-commit-sha>`. It records the immutable
image digest in the run summary. The image job sets `BUILD_NODE_HEAP_MB=8192`,
matching the successful validation build; this affects only the off-host builder,
not runtime container memory. The workflow does not deploy, run staging
migrations, or access the VPS. Keep the container package private.

The image build deliberately does not accept an externally managed Server Actions
key. Next.js generates a fresh per-build key in its server output. Keep the GHCR
package private and deploy the exact same immutable image digest to every web
replica in a release. The VPS needs authenticated read access to the package.

For an authorized staging upgrade, confirm the source SHA and successful run,
record the current app image/version, verify staging backups, and pull the new
image by digest. Use the inspected live staging Compose file and environment,
not this initial-provisioning template. Update only the staging app image/version
and recreate the existing staging app roles with `--no-deps`. Do not rerun seeds;
review migration differences before considering any schema operation. Retain the
previous image and environment for rollback.

For the current staging hostname transition, set `APP_URL` and `BETTER_AUTH_URL`
to `https://app.frekatio.co.uk`, and explicitly pass
`BETTER_AUTH_TRUSTED_ORIGINS=https://staging.uvanoo.com` to the app roles. The old
origin remains an allowed login callback; login emails use the canonical host.

Verify readiness/version, web and worker health, HTTPS at `app.frekatio.co.uk`,
the fallback `staging.uvanoo.com`, and GM login/Training access before declaring a
release complete. Image publication alone is not a deployment.

## Historical initial-provisioning plan

The following checkpoint describes the original preparation batch, not the
current live deployment. Its uncommitted-source inventory and capacity figures
must not be used as the state of a later release.

**Preparation only. Nothing has been deployed or provisioned.** This template
requires hostname/routing decisions, reviewed image digests, unique credentials,
and a capacity check before future execution. Do not run it on the 4 GB VPS now.

Checkpoint: `vps-c54e0b88`, `ubuntu`, `/opt/beaconhs/beaconhs`, branch
`feature/uvanoo-phase-1-foundation`, HEAD
`a4b7f6e932316c6538b920840db267a369d9f0d1`, 74 pre-existing porcelain entries.
Preserve that work; do not reset, clean, pull, rebase, switch branches, or commit
in the current preparation batch.

## Isolation and inputs

Always select this file and project explicitly; never merge it with the root
Compose file. **Never reuse the existing development/Dokploy workflow unchanged:
it can affect shared production resources.** This package has no external
networks/volumes, production routes, privileged mounts, Docker socket, build
section, automatic migration/seed, or bootstrap SQL mount. All services require
an explicit profile. The network is internal, and Compose prefixes the named
network/volumes with `uvanoo-staging`. PostgreSQL, Redis, and MinIO expose no host
ports. Web and Mailpit are loopback-only on 13000 and 18025. Verify those ports
and all generated resource names are unused before any future creation.

The Compose environment is an explicit allowlist. Database/Redis/internal-web
hosts, database name, SMTP target, and bucket are fixed to staging. The operations
URLs in `.env.example` document migration/seed inputs; Compose constructs runtime
DB URLs from staging-only password inputs instead of accepting arbitrary DB URLs.
No `env_file` injects the entire operations environment into containers.
`MIGRATION_DATABASE_URL`, owner/backup credentials, PostgreSQL bootstrap password,
and MinIO root password are never given to web/worker/scheduler. The maintenance
login is BYPASSRLS, as the app requires, but is neither a superuser nor an owner.

Only use newly generated staging credentials in a protected file outside Git and
outside the build context. Do not read/copy existing deployment secret files.
Use distinct random hex DB passwords (at least 32 characters) so the Compose URL
interpolation needs no escaping; operations URLs must match them. Auth and
attachment secrets must be separate, strong random values. Never render a real
resolved Compose configuration into logs. Fake placeholders are documentation,
not valid credentials or an execution approval.

Additional Compose/provisioning inputs are documented in `.env.example`:
`STAGING_APP_IMAGE`, `STAGING_MINIO_IMAGE`, `STAGING_MAILPIT_IMAGE` are immutable
image references; `STAGING_POSTGRES_PASSWORD` is the bootstrap administrator;
`STAGING_APP_PASSWORD`, `STAGING_SUPER_PASSWORD`, `STAGING_MIGRATOR_PASSWORD`,
`STAGING_BACKUP_PASSWORD` feed the corresponding DB logins;
`STAGING_MINIO_ROOT_PASSWORD` is storage administration only;
`STAGING_PROVISION_CONFIRM` is the SQL acknowledgement. App environment names
come from the root `.env.example`, Dockerfile, entrypoint and readiness source.
`APP_VERSION` is supplied from `DEPLOYMENT_VERSION` for readiness reporting.
SMTP stays Mailpit-only. Leave VAPID/Sentry empty initially; no production email,
SMS, AI, push or integration credentials, database restores, or live customer data.

## Immutable source and off-host image (later)

1. Recheck the checkpoint and inventory, including staged, unstaged, untracked,
   binary, and deleted paths. Preserve all 74 existing entries and these new
   staging files. Building HEAD alone **omits the current work**.
2. On a separately authorized later pass, make an explicit, reviewed source
   allowlist from tracked files plus non-ignored untracked source files. Include
   current bytes for existing files and omit tracked deletions. Review names
   before reading/copying; exclude secret-bearing deployment helpers, `.env`
   files except fake examples, `.local`, `private`, ignored ETL/dumps, credentials,
   dependencies, caches, build output and `.git`. Apply `.dockerignore` exclusions
   too. Never tar the repository wholesale or export all untracked files blindly.
3. Produce a source manifest with paths, file modes, SHA-256 hashes, deletion list,
   base HEAD and status inventory; verify every pre-existing change is represented.
   Hash the archive and verify it after transfer. Retain these immutable artifacts
   securely. This preparation batch creates neither the archive nor a commit.
4. Build later on a suitably sized, isolated linux/amd64 builder with the exact
   snapshot. In that **separate** build workspace, create a snapshot Git commit
   after reviewing its manifest, and use its exact 40-character SHA for the
   Dockerfile `DEPLOYMENT_VERSION` build argument. Record the base HEAD separately:
   do not label dirty source as if it were the unchanged base commit. Do not commit
   to or change the source VPS checkout as part of this procedure.
5. The Dockerfile lets Next.js generate a fresh Server Actions encryption key for
   each build. Do not supply an external key by secret, environment variable, or
   build argument. Deploy the same immutable digest to every replica in a release.
   The optional build argument is `NEXT_PUBLIC_SENTRY_DSN`; leave it empty initially.
   Builds/installations happen only in that later authorized builder. Pin all
   infrastructure images to reviewed digests, including PostgreSQL 16 and Redis
   7.4 family images.
6. Record source archive hash, snapshot SHA, build inputs and resulting image
   digest. Set `STAGING_APP_IMAGE` to that digest and `DEPLOYMENT_VERSION` to the
   snapshot SHA; all three app roles use the same image. Keep the earlier staging
   image digest and data backup identifiers for rollback.

## Future provisioning, migration and seed sequence

These steps require a separate execution decision after capacity is sufficient.
Use only the isolated staging Docker context/project. Before each write, verify
context/host, service labels, network membership, volume names, resolved endpoint
IP, database name and login. A staging-looking hostname alone is not proof.
Stop on any shared resource or unexpected connection. Review only redacted
configuration; never print connection passwords.

1. Render the template with **fake** inputs first using the static command below.
   Later review real input targets privately, verify unused names/ports and enough
   RAM/disk, and start only PostgreSQL, Redis, MinIO and Mailpit with profile
   `staging`. Do not start app roles until provisioning, storage-init, migrations
   and the seed checks below succeed. No production modifications are implied.
2. PostgreSQL starts with bootstrap login `uvanoo_staging_bootstrap` and database
   `postgres`. Connect directly to the staging PostgreSQL service, never a shared
   pooler. Verify `current_database()`, `session_user`, `inet_server_addr()`,
   `inet_server_port()` and `version()` against the inspected staging container.
   Use a protected PGPASSFILE or equivalent, not a password in a command argument.
3. In a temporary PostgreSQL 16 client environment attached only to the staging
   network, export the four staging login password inputs securely. Set
   `STAGING_PROVISION_CONFIRM=PROVISION_FRESH_UVANOO_STAGING_ONLY`, then invoke:

   ```sh
   psql -X -h uvanoo-staging-postgres -p 5432 -U uvanoo_staging_bootstrap -d postgres -f docker/staging/provision.sql
   ```

   The script refuses a non-16 server, wrong bootstrap database/login, existing
   staging roles/database or fake/short/reused passwords. Passwords are environment
   parameters, never SQL literals in the repository. Names are deliberately fixed
   to staging. This is fresh provisioning: on partial failure stop and inspect;
   do not drop resources or rerun blindly. The script follows
   `scripts/cluster/provision.sql`, including extensions, ownership, ETL grants,
   defaults and connection hygiene. Only the migrator may SET ROLE to the NOLOGIN
   owner; app is DML/NOBYPASSRLS; maintenance is DML/BYPASSRLS; backup is read-only
   BYPASSRLS. The backup login is required by `migrate.ts` preflight.

4. Complete [storage initialization](STORAGE.md) with the bucket-restricted user.
5. Prepare a temporary operations environment from the **same immutable source**
   with its previously built/installed toolchain. The runtime image has no
   migration/seed role; do not invent one or install tools on this VPS. Supply only
   staging operations env through a protected absolute path. Confirm all three DB
   URLs use `uvanoo-staging-postgres:5432/uvanoo_staging` and distinct staging
   logins; verify each live connection identity before proceeding. There must be
   no production DNS aliases, shared pooler, inherited DB variables or ambient
   repository `.env` in this environment.
6. From that snapshot's `packages/db` directory, use the installed local tsx
   directly to avoid the package scripts' `--env-file=../../.env` behavior:

   ```sh
   ./node_modules/.bin/tsx --env-file=/secure/uvanoo-staging-operations.env src/migrate.ts
   ```

   Run in a clean process environment: inherited variables can override an env
   file. Set all three DB URLs, `DATABASE_OWNER_ROLE=uvanoo_staging_owner` and
   `DATABASE_BACKUP_ROLE=uvanoo_staging_backup`. Require exit zero, correct role
   preflight, complete ledger, RLS and grant installation. Do not use db:push.

7. For a fresh, empty staging database only, verify the `tenants` and `users`
   tables are empty and the maintenance connection is staging. Remove the
   migration credential from the seed environment, then invoke the same installed
   tsx with a separate staging-only seed env file and `src/seed.ts`. This uses
   `createSuperClient()`, creates the synthetic Acme Industrial demo and
   `admin@beaconhs.local`. Existing admin causes the seed to skip; do not treat a
   skipped seed as evidence that fixtures are complete. Confirm demo rows exist.
   Create synthetic Uvanoo hospitality fixtures through the staging UI if the
   generic seed does not cover them; never import production tenant data.
8. Remove the temporary migration/seed environment and its credentials after
   use. Start web, then worker and scheduler with the explicit staging profile.
   Check their exit/restart state and queue processing; web readiness alone does
   not establish worker/scheduler/storage health.

## Routing, browser acceptance and rollback (later)

Decide the app HTTPS hostname (currently `staging.example.invalid`) and a separate
storage hostname. Match APP_URL and BETTER_AUTH_URL exactly. Web's loopback port
is suitable for a host-local probe; Mailpit stays accessible only through a
secure tunnel. The internal network deliberately prevents outbound integrations.
Any browser routing gateway must be designed separately for staging, with no
production network reuse or Traefik/Dokploy edits in this preparation. In Dokploy,
use a new isolated project/service definition, disable automatic Git builds and
hooks, select the prebuilt digest, and review the generated network/route mapping
before authorizing it. If Dokploy injects shared resources, stop.

Verify `/api/health/ready` returns HTTP 200, `status: ready` and `version` equal to
the snapshot SHA, both locally and through the chosen HTTPS route. It probes
app/maintenance DB, Redis and auth initialization, **not storage or background
workers**. Verify `/login` returns the expected login page and correct staging
links. Use the seeded admin's magic link captured in Mailpit. Confirm app branding,
tenant entitlements, property/building/floor/room flows, maintenance, diary and
signoff; test a second synthetic tenant for isolation. Check upload/download and
multipart handling after the storage hostname/CORS work, private attachment
access, worker processing, scheduler jobs, and captured email. Confirm Collabora
editing is disabled. Record failures; no Geist PDF/AppArmor investigation is part
of this batch. Full gates remain for a later authorized validation pass.

Before subsequent staging upgrades, take and verify staging-only database and
storage backups and record the prior image digest/source manifest. If startup or
smoke checks fail, stop only this project's app services and keep its data volumes.
For a compatible schema, return all three roles to the previous digest/version.
For incompatible schema changes, restore a verified staging-only backup into a
new isolated staging recovery database/volume and review targets before switching.
Do not run blind down migrations, `down -v`, global prune, or touch production.
For the first failed launch, leave app roles stopped and preserve diagnostic data.

## Preparation checks and remaining decisions

Cheap static checks only, using tools already present:

```sh
docker compose --env-file docker/staging/.env.example -p uvanoo-staging -f docker/staging/compose.yaml --profile staging --profile staging-init config --quiet
node_modules/.bin/prettier --check docker/staging/README.md docker/staging/STORAGE.md docker/staging/compose.yaml docker/staging/storage-policy.json
git diff --check -- docker/staging
```

The config command parses only and does not start or pull images. For new
untracked files, also check whitespace using `git diff --no-index --check` against
`/dev/null`; a normal path diff alone omits them. SQL receives static review only:
no database execution validation is claimed. YAML/JSON parsing and policy/role
checks do not prove deployability or live access control.

Open decisions: app and storage HTTPS hostnames; isolated routing/gateway and
browser CORS; capacity upgrade and off-host builder/registry; reviewed image
digests and fresh credentials; operator for provisioning; hospitality smoke-test
fixtures. Restart policy/resource limits can be reviewed against measured staging
capacity later. These are execution prerequisites, not permission to deploy now.

## Staging email capture

Set `EMAIL_CAPTURE_MODE=uvanoo-staging-mailpit` on staging app roles. This operator-only setting redirects all email providers to the fixed Mailpit service on port 1025 without credentials. Database provider settings cannot enable this mode. Keep the staging platform email provider enabled and pointed at Mailpit with global-only policy. Normal deployments retain public-host and TLS checks. Never set this capture mode on production.

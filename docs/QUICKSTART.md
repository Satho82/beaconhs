# Quick start

## One-click launchers

From the repo root:

- macOS: double-click `scripts/launchers/dev.command`
- Windows: double-click `scripts/launchers/dev.bat`
- Linux: run `scripts/launchers/install-linux-desktop.sh`, then launch
  **BeaconHS Dev** from your application menu

The launchers install dependencies when needed, start Docker services, run
`pnpm dev`, and clean up launcher-started processes on exit. They default to
`BEACONHS_DB_MODE=auto`: existing `.env` files with a remote `DATABASE_URL` keep
using the remote PG cluster, while fresh local clones use Docker Postgres.

## Manual local setup

```bash
# 1. Prereqs
nvm use              # Node 24 LTS (see .nvmrc)
corepack enable       # pnpm via corepack

# 2. Install dependencies
pnpm install

# 3. Configure env
cp .env.example .env
# (the local defaults work against the docker-compose services below)

# 4. Bring up local infra
docker compose --profile local-db up -d  # postgres:5433, redis:6380, minio:9000/9001, mailpit:8025

# 5. Set up the database
pnpm db:migrate       # apply migrations + install RLS policies
pnpm db:seed          # creates a super-admin + a 'demo' tenant with built-in roles

# 6. Run the app
pnpm dev              # starts web (3000) + worker + scheduler in parallel
```

Then open:

- App: <http://localhost:3000>
- Mailpit (catches outbound email): <http://localhost:8025>
- MinIO console: <http://localhost:9001> (login `beaconhs` / `beaconhs-dev-secret`)

> Postgres is on **5433** and Redis on **6380** so they don't collide with
> common local services. `.env.example` already uses those ports. Maintainers
> with an existing `.env` that points at an external Postgres cluster can run
> `docker compose up -d` without the `local-db` profile and keep using that
> database.
>
> Fresh local Postgres volumes provision four separate roles automatically:
> the DML-only app login, the BYPASSRLS maintenance login, a migration-only
> login, and a NOLOGIN object owner. If your `postgres-data` volume predates
> this role split, back it up and run `scripts/cluster/provision.sql` as that
> volume's existing PostgreSQL superuser before using the current `.env`.

Maintainers using the shared dev PG cluster should keep their real `.env`
`DATABASE_URL` pointed at that cluster and start only the supporting services:

```bash
docker compose up -d
pnpm dev
```

## Default super-admin

After `pnpm db:seed`, sign in as `admin@beaconhs.local`. Use the **Magic link**
tab on the login form — the link will arrive in Mailpit at
<http://localhost:8025>.

## Uvanoo Demo Hotel dataset

The hotel dataset is separate from the generic seed and never runs automatically. It is
idempotent, uses deterministic seed-owned IDs, and refuses to touch a same-slug tenant
unless that tenant carries the `uvanoo-demo-hotel-v1` ownership marker.

For a local development database:

```bash
UVANOO_DEMO_SEED_TARGET=development \
UVANOO_DEMO_SEED_CONFIRM=SEED_UVANOO_DEMO_HOTEL_DEVELOPMENT \
pnpm db:seed:demo-hotel
```

For an explicitly configured staging environment, use target `staging` and confirmation
`SEED_UVANOO_DEMO_HOTEL_STAGING`. The guard additionally requires
`SENTRY_ENVIRONMENT=staging` and a database named exactly `uvanoo_staging`. Any missing,
unknown, or production target is rejected. `UVANOO_DEMO_SEED_DRY_RUN=1` prints the
expected count contract without opening a database connection; set
`UVANOO_DEMO_SEED_ANCHOR` to an ISO timestamp when a reproducible time window is needed.

The script creates user identities and RBAC memberships, but deliberately does not create
shared passwords. Use the existing secure authentication/invitation flow for interactive
sign-in.

## What is included

The workspace contains the complete web app, worker, scheduler, database
schema/migrations/RLS, authentication and tenant permissions, Builder form
designer and runtime, compliance engine, Insights dashboards, printable report
studio, document and training editors, storage, notifications, and integration
sync/outbound automation. The old plugin system is retired; use
**Integrations**. Company-specific migration adapters belong in the ignored
private ETL package and are not part of the public repository.

[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) is historical design context.
Verify any old phase/status note against current code before relying on it.

# Empty DEV first identity

This is an operator CLI, not a route, invitation replacement, or general user seed.
It is restricted to `/opt/uvanoo-dev/source` on `vps-c54e0b88`, the internal
`uvanoo-dev-private` network, and PostgreSQL `beaconhs` in `uvanoo-dev-postgres`.
It requires a clean checkout and a locally pulled immutable image whose revision
label equals the explicitly supplied validated source SHA. Run only after that
exact source has passed V1.4 cloud validation.

Supply `UVANOO_ENVIRONMENT=development`,
`UVANOO_FIRST_IDENTITY_CONFIRM=CREATE_FIRST_DEV_IDENTITY`,
`UVANOO_VALIDATED_SHA`, and `UVANOO_VALIDATED_IMAGE`, then run
`pnpm --filter @beaconhs/web dev:first-identity` on the authorized host.
Never supply a password on the command line. The launcher generates an exclusive,
mode-600 `/opt/uvanoo-dev/first-identity.secret.env` outside Git and retains it for
subsequent real login. It never prints the password or raw database/auth errors.

The launcher checks live Docker container/network identity, isolation, absence of
DEV web writers, private environment-file permissions, image digest/revision and
source state. A read-only target attestation goes into a bounded, temporary CLI
container. The inner command separately rejects ambiguous/prod/staging execution,
wrong database host/name/role/options, wrong email and weak/missing secrets. It
also compares the connected server address and database role to that attestation.

Inside one database transaction it takes an exclusive authentication-user-table
lock and requires exactly zero users. It calls the installed Better Auth public
server API `auth.api.signUpEmail` through its supported Drizzle adapter bound to
that transaction. Better Auth owns password hashing and account creation.
Auto-sign-in is disabled: provisioning creates no session. A platform security
audit event commits in the same transaction; failures roll everything back.

The private Better Auth instance exists only inside the CLI function and exports
no handler. Neither public application's `disableSignUp: true` setting changes.
No new HTTP route, admin plugin, schema migration, or privileged runtime identity
is installed. The first identity is not made a platform super-admin.

The only accepted email is `dev.admin@uvanoo.invalid`. A second execution refuses;
it does not reconcile, replace, rotate, or add users. Further user creation stays
with existing authenticated administration/invitations. Tenant/property/membership
bootstrap is a separate operation and must not call first-identity provisioning.

Focused tests: `pnpm --filter @beaconhs/web exec vitest run
scripts/dev-first-identity.test.ts`. Tests cover positive and negative guards,
connected-server mismatch, nonempty/second-run refusal, the supported API call,
audit without secrets, no automatic session, unchanged public signup settings,
and absence of bootstrap routes/manual credential writes.

Reference: [Better Auth server APIs](https://better-auth.com/docs/concepts/api).
Installed 1.6.23 source was inspected; do not infer compatibility from latest docs
alone. Next.js and container builds run only in GitHub Actions.

## Separate minimal tenant fixture

After successful first-identity creation and verified second-run refusal, set
`UVANOO_DEV_BOOTSTRAP_CONFIRM=CREATE_MINIMAL_DEV_TENANT` in addition to the same
DEV target confirmations and run `pnpm --filter @beaconhs/web dev:minimal-tenant`.
This is a separate command; it cannot create authentication identities.

It requires exactly the non-superadmin first DEV user with its platform audit
provenance. It refuses unrelated tenants, memberships, properties and modified
role assignments. It composes the canonical tenant baseline, built-in tenant-admin
role, role-assignment validation and hospitality property creation service.
Reference defaults are allowed; operational/demo records are never generated.
Its maintenance connection is the established `beaconhs_super` role, explicitly
bound to the verified DEV target. Property creation and permission verification
then run through the ordinary `beaconhs_app` tenant context, with RLS enforced and
`isSuperAdmin=false`. The resulting browser identity has no platform-wide access.

Run it twice and verify stable tenant/property/membership/assignment counts and
no extra audit records on the second run. Both commands share only a Docker
execution/attestation helper, not identity-creation behaviour. DEV web must remain
stopped while either command runs. Unit tests include idempotency, refusal of
unrelated tenants and membership/scope collisions, and absence of operational
data writes. Real database and browser smoke verification remains mandatory.

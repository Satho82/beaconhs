# Uvanoo Preview Platform

The Preview Platform is the only supported route for owner visual acceptance of a
module before controlled DEV admission.

## Guarantees

- an immutable image is built and validated by CI, not on the VPS;
- each preview is web-only and has its own HTTPS host;
- the web service joins only its preview runtime network and the Traefik ingress
  network — never DEV or production runtime networks;
- its runtime secret points only to a short-lived, cloned preview data plane;
- no worker, scheduler, migrations, seeds, or automatic deployment runs;
- the preview host uses native authentication against the cloned data plane;
- owner approval requires rendered desktop, tablet, and mobile evidence.

## Lifecycle

1. The module remains in an isolated worktree and is committed.
2. Run **Build preview image** in GitHub Actions with a lower-case preview slug.
3. Record the resulting immutable image digest and commit SHA.
4. Bootstrap a dedicated preview data clone from the approved DEV backup/snapshot.
   This clone is writable only by the preview application and is never DEV.
5. Create a preview-only overlay network and Docker secret containing only the
   preview runtime configuration.
6. Deploy `deploy/preview/compose.yml` as a separate Dokploy compose record,
   with `IMAGE`, `APP_VERSION`, `PREVIEW_HOST`,
   `PREVIEW_RUNTIME_NETWORK`, and `PREVIEW_RUNTIME_SECRET` set explicitly.
7. Verify HTTPS, native login, health readiness, and rendered screenshots.
8. Owner reviews the named preview host.
9. Destroy the preview compose record, network, data clone, secret, and DNS
   route on approval/rejection or at its expiry.

## Mandatory admission checks

| Check | Required evidence |
| --- | --- |
| Provenance | exact source SHA and GHCR digest |
| Isolation | inspect confirms preview network + `dokploy-network` only |
| Data | fresh clone identifier; no DEV/prod database connection |
| Build | successful CI typecheck and production image build |
| Runtime | `/api/health/ready` over HTTPS |
| UX | rendered browser screenshots at desktop, tablet and mobile |
| Owner | recorded visual approval before DEV canary |

## Explicitly prohibited

- `next dev` exposed by a raw VPS port;
- SSH tunnel or public port used as the standard acceptance path;
- a preview service attached to `uvanoo-dev-runtime`;
- building a module image on the VPS;
- copying DEV credentials into a worktree or logs;
- authentication bypasses, prefilled credentials, fake data, migrations, or
  direct deployment from a module branch.

## Metering disposition

The current Metering commit is not approved or deployable yet. Its temporary
preview is an incident example only; it must be removed after the Preview
Platform bootstrap is complete. Rebuild Metering through this platform, then
repeat visual acceptance.

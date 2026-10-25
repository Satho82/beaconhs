# DEV-INFRA-02A — cloud build policy

Heavy validation and application image builds for Uvanoo V1.4 run on GitHub-hosted Linux runners. The VPS is reserved for isolated DEV runtime services, database-backed functional testing, browser rendering, screenshots, and visual comparison artifacts.

The `Uvanoo V1.4 cloud validation and DEV image` workflow accepts an explicit immutable `source_sha` for manual dispatch; a push run uses its immutable event SHA. It records both the validated/built source SHA and image tag/digest in the workflow summary. It performs dependency installation, formatting, typecheck, lint, migrations against ephemeral CI services, tests, a Next.js web build, and a linux/amd64 container build. It publishes a private immutable candidate under `ghcr.io/satho82/uvanoo-staging-private:v1.4-dev-<sha>`.

It contains no VPS, SSH, Dokploy, staging, production, or deployment steps. Runtime credentials remain external to the image. A governed DEV writer-fence bootstrap is validated as part of the candidate contract; it is only used later by the separate DEV-only maintenance workflow and never by this build workflow. To recover, dispatch the workflow from `feature/uvanoo-v1.4` and provide the exact SHA; use the resulting digest for a later explicitly authorized DEV runtime stage.

- Governed writer-fence failures emit only a symbolic stage code; control-plane response bodies and credentials are never written to release logs.
- The approved writer-fence bootstrap validates either the legacy single writer control or an already-established independent control set; mixed or malformed layouts remain rejected.
- Docker Compose validation failures in the writer fence are reported as a symbolic stage code; Compose output is not written to release logs.
- The bootstrap may migrate only the exact legacy writer replica placeholders into the four approved independent placeholders before applying the all-zero fence; all other saved compose content is preserved and re-read before deployment.
- The bounded compose-control migration uses literal control names constructed without interpolation, preserving the candidate contract parser and secret-free validation output.

### 2026-10-25 governed writer-fence correction

The DEV writer-maintenance fence now explicitly preserves the existing disabled
`collabora` sidecar while validating and controlling only the four writer
services. This correction followed a safe pre-mutation fence refusal; it does
not admit, start, or modify Collabora.

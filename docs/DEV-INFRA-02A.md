# DEV-INFRA-02A — cloud build policy

Heavy validation and application image builds for Uvanoo V1.4 run on GitHub-hosted Linux runners. The VPS is reserved for isolated DEV runtime services, database-backed functional testing, browser rendering, screenshots, and visual comparison artifacts.

The `Uvanoo V1.4 cloud validation and DEV image` workflow accepts an explicit immutable `source_sha` for manual dispatch; a push run uses its immutable event SHA. It records both the validated/built source SHA and image tag/digest in the workflow summary. It performs dependency installation, formatting, typecheck, lint, migrations against ephemeral CI services, tests, a Next.js web build, and a linux/amd64 container build. It publishes a private immutable candidate under `ghcr.io/satho82/uvanoo-staging-private:v1.4-dev-<sha>`.

It contains no VPS, SSH, Dokploy, staging, production, or deployment steps. Runtime credentials remain external to the image. To recover, dispatch the workflow from `feature/uvanoo-v1.4` and provide the exact SHA; use the resulting digest for a later explicitly authorized DEV runtime stage.

# DEV-INFRA-02A — cloud build policy

Heavy validation and application image builds for Uvanoo V1.4 run on GitHub-hosted Linux runners. The VPS is reserved for isolated DEV runtime services, database-backed functional testing, browser rendering, screenshots, and visual comparison artifacts.

The `Uvanoo V1.4 cloud validation and DEV image` workflow checks out the frozen V1.4 SHA, performs dependency installation, formatting, typecheck, lint, migrations against ephemeral CI services, tests, a Next.js web build, and a linux/amd64 container build. It publishes a private immutable candidate under `ghcr.io/satho82/uvanoo-staging-private:v1.4-dev-542c2014`; the workflow summary records its digest.

It contains no VPS, SSH, Dokploy, staging, production, or deployment steps. Runtime credentials remain external to the image. To recover, dispatch the workflow from `feature/uvanoo-v1.4`; it checks out the fixed source SHA and recreates the same tagged candidate, then use the resulting digest for a later explicitly authorized DEV runtime stage.

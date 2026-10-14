#!/usr/bin/env bash
# Read-only gate container. No public ports, app entrypoint, production fallback or key access.
set -euo pipefail
test "${FEATURE_CANDIDATE_VERIFIED:-}" = true
test "${DEV_RELEASE_ENVIRONMENT:-}" = dev
test "${DOKPLOY_COMPOSE_ID:-}" = wYb0LxLQrvj2FPI21i-Oj
test "${EXPECTED_DOKPLOY_STACK:-}" = uvanoo-v1-4-dev-gniriv
test "${EXPECTED_APP_HOST:-}" = dev.uvanoo.com
test "${EXPECTED_MIGRATION_HOST:-}" = uvanoo-dev-postgres
test "${MIGRATION_DOCKER_NETWORK:-}" = uvanoo-dev-private
test "${GITHUB_REPOSITORY:-}" = Satho82/beaconhs
[[ "${DEPLOY_SOURCE_SHA:-}" =~ ^[a-f0-9]{40}$ ]]
case "${1:-}" in migration|web) export DEV_ADMISSION_PHASE="$1" ;; *) exit 1 ;; esac
evidence_dir="/opt/uvanoo-dev/release-evidence/$DEPLOY_SOURCE_SHA"
test -d "$evidence_dir" && test ! -L "$evidence_dir"
test "$(realpath "$evidence_dir")" = "$evidence_dir"
docker run --rm --pull=never --read-only --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  --memory 512m --cpus 1 --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges \
  --network "$MIGRATION_DOCKER_NETWORK" \
  -v "$GITHUB_WORKSPACE:/workspace:ro" \
  -v "$MIGRATION_PNPM_TOOLCHAIN_ROOT:/pnpm-toolchain:ro" \
  -v "$evidence_dir:/release-evidence:ro" -w /workspace \
  -e PATH=/pnpm-toolchain/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -e FEATURE_CANDIDATE_VERIFIED -e DEV_RELEASE_ENVIRONMENT -e GITHUB_REPOSITORY \
  -e DOKPLOY_COMPOSE_ID -e EXPECTED_DOKPLOY_STACK -e EXPECTED_APP_HOST \
  -e EXPECTED_MIGRATION_HOST -e MIGRATION_DOCKER_NETWORK \
  -e DEPLOY_SOURCE_SHA -e IMAGE_DIGEST -e DEV_ADMISSION_PHASE \
  -e DEV_RELEASE_EVIDENCE_PATH=/release-evidence/manifest.json \
  -e DEV_RELEASE_EVIDENCE_SHA256 -e DEV_TEMPORARY_APPROVAL_SHA256 \
  -e DEV_BACKUP_DATABASE_URL -e MIGRATION_DATABASE_URL \
  "$MIGRATION_NODE_IMAGE" \
  pnpm --filter @beaconhs/db exec tsx src/verify-dev-release-admission.ts

#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

candidate='.github/workflows/deploy-v1.4-dev-candidate.yml'
core='.github/workflows/deploy-dev.yml'
cloud='.github/workflows/uvanoo-v1.4-cloud-build.yml'

require() {
  local pattern="$1"
  local file="$2"
  if ! grep -Eq -- "$pattern" "$file"; then
    echo "Missing required candidate-deployment contract in ${file}: ${pattern}" >&2
    exit 1
  fi
}

forbid() {
  local pattern="$1"
  local file="$2"
  if grep -Eiq -- "$pattern" "$file"; then
    echo "Forbidden candidate-deployment contract in ${file}: ${pattern}" >&2
    exit 1
  fi
}

# The feature workflow publishes images on push, but its only deployment
# entrypoint is deliberately manual and accepts just one explicit source SHA.
require '^  workflow_dispatch:$' "$candidate"
forbid '^  push:' "$candidate"
require '^      source_sha:$' "$candidate"
require 'type: string' "$candidate"
require '^  CANDIDATE_IMAGE_NAME: ghcr\.io/satho82/uvanoo-staging-private$' "$candidate"
forbid '^[[:space:]]*(environment|target_environment|deployment_environment):' "$candidate"
forbid '^[[:space:]]*(staging|production):' "$candidate"
forbid '^[[:space:]]*(target|environment):.*(staging|production)' "$candidate"
require 'ref: feature/uvanoo-v1.4' "$candidate"
require 'fetch-depth: 0' "$candidate"
require '\^\[0-9a-f\]\{40\}\$' "$candidate"
require 'git cat-file -e' "$candidate"
require 'git merge-base --is-ancestor' "$candidate"

# A green workflow conclusion alone is insufficient: both authoritative jobs
# must have passed, and the tag must be bound to the requested source by OCI
# labels before the digest may enter the reusable deployment workflow.
require 'uvanoo-v1.4-cloud-build\.yml/runs\?head_sha=' "$candidate"
require 'Validate frozen V1\.4 source' "$candidate"
require 'Publish immutable V1\.4 DEV candidate' "$candidate"
require 'v1\.4-dev-\$\{CANDIDATE_SHA\}' "$candidate"
require 'docker buildx imagetools inspect' "$candidate"
require '\^sha256:\[0-9a-f\]\{64\}\$' "$candidate"
require 'org\.opencontainers\.image\.revision' "$candidate"
require 'org\.opencontainers\.image\.version' "$candidate"
require 'image="\$\{CANDIDATE_IMAGE_NAME\}@\$\{digest\}"' "$candidate"
forbid 'latest' "$candidate"
require 'feature_candidate_verified: true' "$candidate"
require 'source_sha: \$\{\{ needs\.verify-candidate\.outputs\.source_sha \}\}' "$candidate"
require 'image_digest: \$\{\{ needs\.verify-candidate\.outputs\.image_digest \}\}' "$candidate"

# The core retains its gated main build while feature deployments skip builds
# and deploy the verified source checkout, digest image, APP_VERSION, and
# readiness identity instead of the dispatch workflow SHA.
require 'if: inputs\.source_sha ==' "$core"
require 'CI_GATE_COMPLETED' "$core"
require 'REF" != refs/heads/main' "$core"
require 'DEPLOY_SOURCE_SHA: \$\{\{ inputs\.source_sha \|\| github\.sha \}\}' "$core"
require 'DEPLOY_IMAGE_NAME:.*uvanoo-staging-private' "$core"
require 'CALLER_WORKFLOW_REF' "$core"
require 'deploy-v1\.4-dev-candidate\.yml@' "$core"
require 'ref: \$\{\{ env\.DEPLOY_SOURCE_SHA \}\}' "$core"
require 'APP_VERSION=%s\\n' "$core"
require '\$DEPLOY_SOURCE_SHA' "$core"
require 'DEPLOY_IMAGE_NAME\}@\$\{IMAGE_DIGEST\}' "$core"
require 'Previous DEV source SHA' "$core"
require 'Previous DEV image digest' "$core"
forbid 'latest' "$core"

# The existing feature push flow is image publication only; it must never
# obtain the deployment reusable workflow or a deployment job.
require '^  push:$' "$cloud"
forbid 'deploy-dev\.yml' "$cloud"
forbid 'runs-on: \[self-hosted, dokploy\]' "$cloud"

echo 'PASS V1.4 candidate deployment is manual, DEV-only, and digest-bound'

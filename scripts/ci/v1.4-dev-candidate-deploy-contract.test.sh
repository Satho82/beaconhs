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

permission_rank() {
  case "$1" in
    none) echo 0 ;;
    read) echo 1 ;;
    write) echo 2 ;;
    *)
      echo "Unsupported GitHub Actions permission value: $1" >&2
      exit 1
      ;;
  esac
}

job_permission() {
  local file="$1"
  local job="$2"
  local permission="$3"
  awk -v job="$job" -v permission="$permission" '
    $0 == "  " job ":" { in_job = 1; next }
    in_job && /^  [A-Za-z0-9_-]+:/ { exit }
    in_job && /^    permissions:/ { in_permissions = 1; next }
    in_permissions && /^    [^[:space:]]/ { exit }
    in_permissions && $1 == permission ":" { print $2; exit }
  ' "$file"
}

assert_nested_job_permissions() {
  local caller_permission callee_permission caller_rank callee_rank
  for permission in contents packages; do
    caller_permission="$(job_permission "$candidate" deploy-dev "$permission")"
    if [ -z "$caller_permission" ]; then
      echo "Missing caller permission ${permission} on candidate reusable-workflow job" >&2
      exit 1
    fi
    caller_rank="$(permission_rank "$caller_permission")"
    for callee_job in build deploy; do
      callee_permission="$(job_permission "$core" "$callee_job" "$permission")"
      if [ -z "$callee_permission" ]; then
        echo "Missing ${permission} permission on reusable workflow job ${callee_job}" >&2
        exit 1
      fi
      callee_rank="$(permission_rank "$callee_permission")"
      if [ "$callee_rank" -gt "$caller_rank" ]; then
        echo "Reusable workflow job ${callee_job} requests ${permission}: ${callee_permission}, beyond caller cap ${caller_permission}" >&2
        exit 1
      fi
    done
  done
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
require 'mapfile -t run_ids < "\$run_ids_file"' "$candidate"
require '"\$\{#run_ids\[@\]\}" -ne 1' "$candidate"
forbid 'gh api --paginate.*head -n 1' "$candidate"
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

# Parse the workflow graph so a missing job output, an accidental caller guard,
# or a concurrency self-deadlock cannot silently omit the reusable deployment.
ruby <<'RUBY'
require 'yaml'

candidate = YAML.safe_load(File.read('.github/workflows/deploy-v1.4-dev-candidate.yml'), aliases: true)
core = YAML.safe_load(File.read('.github/workflows/deploy-dev.yml'), aliases: true)
verify = candidate.dig('jobs', 'verify-candidate')
deploy = candidate.dig('jobs', 'deploy-dev')

unless verify.dig('outputs', 'source_sha')&.include?('steps.verify.outputs.source_sha') &&
       verify.dig('outputs', 'image_digest')&.include?('steps.verify.outputs.image_digest')
  abort 'Verifier must declare the source_sha and image_digest job outputs consumed downstream'
end
abort 'Candidate reusable deployment must need verify-candidate' unless deploy['needs'] == 'verify-candidate'
abort 'Candidate reusable deployment must not use a caller-level guard that can suppress a verified deploy' if deploy.key?('if')
unless deploy.dig('with', 'source_sha') == '${{ needs.verify-candidate.outputs.source_sha }}' &&
       deploy.dig('with', 'image_digest') == '${{ needs.verify-candidate.outputs.image_digest }}' &&
       deploy.dig('with', 'feature_candidate_verified') == true
  abort 'Candidate reusable deployment must pass only the declared verified outputs and verification flag'
end
abort 'Candidate dispatcher must not hold the reusable deployment concurrency group' if candidate.dig('concurrency', 'group') == core.dig('concurrency', 'group')
abort 'Reusable deployment workflow must retain the canonical deploy-dev concurrency group' unless core.dig('concurrency', 'group') == 'deploy-dev'
core_deploy = core.dig('jobs', 'deploy')
unless core_deploy.dig('env', 'MIGRATION_DOCKER_NETWORK') == "${{ inputs.feature_candidate_verified && 'uvanoo-dev-private' || 'infra-net' }}"
  abort 'Reusable deployment must select uvanoo-dev-private only for verified candidates and preserve infra-net for main'
end
migration_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Run database migrations' }
abort 'Canonical migrations must use the selected migration Docker network' unless migration_step['run'].include?('--network "$MIGRATION_DOCKER_NETWORK"')
connectivity_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Verify migration connectivity' }
abort 'Reusable deployment must verify migrator identity before migrations' unless connectivity_step['run'].include?('beaconhs_migrator|beaconhs')
RUBY

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
assert_nested_job_permissions

# The existing feature push flow is image publication only; it must never
# obtain the deployment reusable workflow or a deployment job.
require '^  push:$' "$cloud"
forbid '^[[:space:]]*uses:.*deploy-dev\.yml' "$cloud"
forbid 'runs-on: \[self-hosted, dokploy\]' "$cloud"

echo 'PASS V1.4 candidate deployment is manual, DEV-only, and digest-bound'

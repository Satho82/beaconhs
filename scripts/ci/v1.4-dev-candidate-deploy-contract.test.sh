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
unless core_deploy.dig('env', 'MIGRATION_DATABASE_URL') == '${{ inputs.feature_candidate_verified && secrets.DEV_MIGRATION_DATABASE_URL || secrets.MAIN_MIGRATION_DATABASE_URL }}'
  abort 'Reusable deployment must select the candidate or normal-main migration secret from the verification flag'
end
unless core_deploy.dig('env', 'EXPECTED_MIGRATION_HOST') == "${{ inputs.feature_candidate_verified && 'uvanoo-dev-postgres' || 'beaconhs-postgres' }}"
  abort 'Reusable deployment must select the matching candidate or normal-main migration host from the verification flag'
end
unless core.dig(true, 'workflow_call', 'secrets', 'MAIN_MIGRATION_DATABASE_URL', 'required') == true &&
       core.dig(true, 'workflow_call', 'secrets', 'DEV_MIGRATION_DATABASE_URL', 'required') == true
  abort 'Reusable deployment must require both explicit migration-context secrets'
end
migration_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Run database migrations' }
abort 'Canonical migrations must use the selected migration Docker network' unless migration_step['run'].include?('--network "$MIGRATION_DOCKER_NETWORK"')
abort 'Canonical migrations must use the pinned migration runtime without pulling' unless migration_step['run'].include?('--pull=never') && migration_step['run'].include?('"$MIGRATION_NODE_IMAGE"')
abort 'Canonical migrations must mount the preflighted pnpm toolchain read-only' unless migration_step['run'].include?('"$MIGRATION_PNPM_TOOLCHAIN_ROOT:/pnpm-toolchain:ro"')
abort 'Canonical migrations must not invoke Corepack' if migration_step['run'].match?(/corepack/)
toolchain_step_index = core_deploy.fetch('steps').index { |step| step['name'] == 'Verify deterministic migration toolchain' }
migration_step_index = core_deploy.fetch('steps').index { |step| step['name'] == 'Run database migrations' }
abort 'Deployment must preflight the pinned migration toolchain before migrations' unless toolchain_step_index && toolchain_step_index < migration_step_index
toolchain_step = core_deploy.fetch('steps')[toolchain_step_index]
unless toolchain_step['run'].include?("pnpm --version)\" != '10.30.3'") &&
       toolchain_step['run'].include?("pnpm --version | grep -Fx '10.30.3'") &&
       toolchain_step['run'].include?('tsx --version') &&
       toolchain_step['run'].include?('--pull=never')
  abort 'Deployment toolchain preflight must prove pnpm 10.30.3 and tsx without a container image pull'
end
preflight_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Preflight all migration database roles' }
abort 'Reusable deployment must preflight all database roles before migrations' unless preflight_step
unless preflight_step['run'].include?('--network "$MIGRATION_DOCKER_NETWORK"') &&
       preflight_step['run'].include?('"$MIGRATION_NODE_IMAGE"') &&
       preflight_step['run'].include?('"$MIGRATION_PNPM_TOOLCHAIN_ROOT:/pnpm-toolchain:ro"')
  abort 'Three-role preflight must use the canonical migration container context'
end
%w[MIGRATION_DATABASE_URL DATABASE_URL SUPERADMIN_DATABASE_URL].each do |url_name|
  abort "Three-role preflight must receive #{url_name}" unless preflight_step['run'].include?("-e #{url_name}=\"$#{url_name}\"")
end
unless %w[beaconhs_migrator beaconhs_app beaconhs_super].all? { |role| preflight_step['run'].include?(role) } &&
       preflight_step['run'].include?('SELECT current_user, current_database()') &&
       preflight_step['run'].include?('identity.current_database !== "beaconhs"')
  abort 'Three-role preflight must verify migrator, runtime, and maintenance identities'
end
unless preflight_step['run'].include?('error.code === "EAI_AGAIN"') &&
       preflight_step['run'].include?('attempt <= 3') &&
       preflight_step['run'].include?('setTimeout(resolve, 1000)')
  abort 'Three-role preflight must use bounded DNS-only readiness retries'
end
url_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Validate migration database URLs' }
abort 'Migration URL validation must reject topology-crossed database hosts' unless url_step['run'].include?('EXPECTED_MIGRATION_HOST') && url_step['run'].include?('does not match the selected deployment topology')
%w[MIGRATION_DATABASE_URL DATABASE_URL SUPERADMIN_DATABASE_URL].each do |url_name|
  abort "URL validation must check #{url_name}" unless url_step['run'].include?(url_name)
end
migration_env = migration_step.fetch('env')
unless migration_env['MIGRATION_DATABASE_URL'] == '${{ env.MIGRATION_DATABASE_URL }}' &&
       migration_env['DATABASE_URL'] == '${{ secrets.DEV_DATABASE_URL }}' &&
       migration_env['SUPERADMIN_DATABASE_URL'] == '${{ secrets.DEV_SUPERADMIN_DATABASE_URL }}'
  abort 'Canonical migrations must receive the same three database URLs after preflight'
end
preflight_step_index = core_deploy.fetch('steps').index { |step| step['name'] == 'Preflight all migration database roles' }
abort 'Three-role preflight must precede canonical migrations' unless preflight_step_index && preflight_step_index < migration_step_index
ci = YAML.safe_load(File.read('.github/workflows/ci.yml'), aliases: true)
main_caller = ci.dig('jobs', 'deploy-dev')
abort 'Normal-main caller must inherit both required migration-context secrets' unless main_caller['secrets'] == 'inherit'
abort 'Candidate caller must inherit both required migration-context secrets' unless deploy['secrets'] == 'inherit'
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
require '^  MIGRATION_NODE_IMAGE: node:24-bookworm@sha256:64af3819f9275802414d7cdc38c27e9d82bd564dec4d4da87d008255d36c63b4$' "$core"
require '^  DEPLOY_UTILITY_IMAGE: alpine:3@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b$' "$core"
require 'docker pull "\$MIGRATION_NODE_IMAGE"' "$core"
require 'docker pull "\$DEPLOY_UTILITY_IMAGE"' "$core"
require 'docker run --rm --pull=never.*\$DEPLOY_UTILITY_IMAGE' "$core"
forbid 'corepack (enable|prepare)' "$core"
forbid 'latest' "$core"
assert_nested_job_permissions

# The existing feature push flow is image publication only; it must never
# obtain the deployment reusable workflow or a deployment job.
require '^  push:$' "$cloud"
forbid '^[[:space:]]*uses:.*deploy-dev\.yml' "$cloud"
forbid 'runs-on: \[self-hosted, dokploy\]' "$cloud"

echo 'PASS V1.4 candidate deployment is manual, DEV-only, and digest-bound'

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
require 'per_page=100' "$candidate"
forbid 'gh api --paginate' "$candidate"
require 'redact_gh_stderr' "$candidate"
require 'api_failure "authoritative-run lookup"' "$candidate"
require 'api_failure "authoritative-run jobs lookup"' "$candidate"
require 'failed \(gh exit \$\{status\}\)' "$candidate"
require 'no stderr captured' "$candidate"
require '2> "\$gh_stderr_file"' "$candidate"
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
require 'tmpdir'
require 'fileutils'
require 'open3'
unless core_deploy.dig('env', 'DEPLOY_GOVERNANCE_SHA') == '${{ github.workflow_sha }}'
  abort 'Deployment governance must be pinned to the caller workflow commit'
end
checkouts = core_deploy['steps'].select { |step| step['uses'].to_s.start_with?('actions/checkout@') }
unless checkouts.any? { |step| step.dig('with', 'ref') == '${{ env.DEPLOY_SOURCE_SHA }}' && !step.dig('with', 'path') } &&
       checkouts.any? { |step| step.dig('with', 'ref') == '${{ env.DEPLOY_GOVERNANCE_SHA }}' && step.dig('with', 'path') == '.deployment-governance' }
  abort 'Frozen application and governance must use distinct pinned checkouts'
end
unless candidate.dig('jobs', 'deploy-dev', 'uses') == './.github/workflows/deploy-dev.yml' &&
       YAML.safe_load(File.read('.github/workflows/ci.yml'), aliases: true)['jobs'].values.any? { |job| job['uses'] == './.github/workflows/deploy-dev.yml' }
  abort 'Both callers must use the same-commit relative reusable workflow'
end
governance_step = core_deploy['steps'].find { |step| step['name'] == 'Verify deployment governance source' }
abort 'Governance checkout must verify its SHA, caller and compose blob' unless governance_step &&
  governance_step['run'].include?('git -C .deployment-governance rev-parse HEAD') &&
  governance_step['run'].include?('test "$DEPLOY_GOVERNANCE_SHA" = "$DEPLOY_SOURCE_SHA"') &&
  governance_step['run'].include?('git hash-object .deployment-governance/deploy/dokploy-dev.compose.yaml')
compose_source = File.read('deploy/dokploy-dev.compose.yaml')
compose_config = YAML.safe_load(compose_source, aliases: true)
%w[web worker scheduler].each do |role|
  abort "#{role} must use the selected runtime network" unless compose_config.dig('services', role, 'networks').include?('runtime-db-network') &&
    !compose_config.dig('services', role, 'networks').include?('infra-net')
end
abort 'Runtime network must require an explicit context selection' unless compose_config.dig('networks', 'runtime-db-network', 'name') == '${RUNTIME_DB_NETWORK:?Set RUNTIME_DB_NETWORK}'
abort 'Storage init does not require database access' unless compose_config.dig('services', 'storage-init', 'networks') == ['infra-net']
compose_assignment = core_deploy['steps'].map { |step| step['run'].to_s }.join("\n").lines.find { |line| line.strip.start_with?('COMPOSE_FILE=') }
abort 'Compose must be loaded from verified governance checkout' unless compose_assignment&.include?('.deployment-governance/deploy/dokploy-dev.compose.yaml')
# A deliberately incompatible application-checkout fixture proves source selection
# without requiring historical objects in the shallow validation checkout.
application_compose = "services:\n  web:\n    networks: [infra-net]\n"
Dir.mktmpdir('uvanoo-governance-contract-') do |dir|
  FileUtils.mkdir_p("#{dir}/deploy")
  FileUtils.mkdir_p("#{dir}/.deployment-governance/deploy")
  File.write("#{dir}/deploy/dokploy-dev.compose.yaml", application_compose)
  File.write("#{dir}/.deployment-governance/deploy/dokploy-dev.compose.yaml", compose_source)
  actual, _, status = Open3.capture3('bash', '-ceu', compose_assignment + "\n" + 'printf "%s" "$COMPOSE_FILE"', chdir: dir)
  abort 'Historical application compose controlled rollout' unless status.success? && actual == compose_source.rstrip
end
runtime_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Preflight candidate runtime topology' }
abort 'Runtime preflight must execute only for verified candidates' unless runtime_step && runtime_step['if'] == 'inputs.feature_candidate_verified'
abort 'Runtime preflight must precede migrations' unless core_deploy['steps'].index(runtime_step) < core_deploy['steps'].index { |step| step['name'] == 'Run database migrations' }
require 'json'
require 'open3'
network_filter = runtime_step['run'][/jq -e '(.*?)'/m, 1]
abort 'Missing executable network inspection filter' unless network_filter
network = { 'Name' => 'uvanoo-dev-runtime', 'Driver' => 'overlay', 'Scope' => 'swarm', 'Attachable' => true, 'Internal' => true }
network_check = lambda do |value|
  _, _, status = Open3.capture3('jq', '-e', network_filter, stdin_data: JSON.generate(value))
  status.success?
end
abort 'Canonical overlay must pass' unless network_check.call([network])
abort 'Missing network must fail' if network_check.call([])
{ 'Name' => 'infra-net', 'Driver' => 'bridge', 'Scope' => 'local', 'Attachable' => false, 'Internal' => false }.each do |key, value|
  abort "Invalid network #{key} accepted" if network_check.call([network.merge(key => value)])
end
redis_script = runtime_step['run'][/exec node -e '(.*?)'\s*\z/m, 1]
abort 'Missing executable Redis preflight' unless redis_script
redis_harness = <<'JS'
const vm = require('node:vm');
const mode = process.argv[1];
let source = '';
process.stdin.on('data', x => source += x);
process.stdin.on('end', () => {
  class Redis {
    on() {}
    async connect() { if (['dns', 'auth', 'connect'].includes(mode)) throw new Error(mode); }
    async ping() { return mode === 'bad-pong' ? 'FAIL' : 'PONG'; }
    disconnect() {}
  }
  const net = { createConnection() {
    const socket = { setTimeout() {}, destroy() {}, once(event, callback) {
      if (event === 'connect') queueMicrotask(callback);
    }};
    return socket;
  }};
  vm.runInNewContext(source, { URL, console, process: { env: { REDIS_URL: 'redis://:fixture@' + (mode === 'wrong-host' ? 'beaconhs-redis' : 'uvanoo-dev-redis') + ':6379' }, exit: process.exit }, require: name => name === 'ioredis' ? Redis : net });
});
JS
%w[pass dns auth connect bad-pong wrong-host].each do |mode|
  _, _, status = Open3.capture3('node', '-e', redis_harness, mode, stdin_data: redis_script)
  abort "Redis runtime fixture #{mode} has unexpected result" unless status.success? == (mode == 'pass')
end
require 'json'
require 'open3'
target_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Resolve the dev deployment target' }
abort 'Routing validator must consume EXPECTED_APP_HOST' unless target_step.dig('env', 'EXPECTED_APP_HOST') == '${{ env.EXPECTED_APP_HOST }}'
routing_filter = target_step.fetch('run')[/jq -e --arg id "\$COMPOSE_ID" --arg host "\$EXPECTED_APP_HOST" '(.*?)' "\$response"/m, 1]
abort 'Missing executable canonical candidate routing validator' unless routing_filter
fixture = {
  'composeId' => 'wYb0LxLQrvj2FPI21i-Oj', 'appName' => 'uvanoo-v1-4-dev-gniriv',
  'environmentId' => 'qT391QtcIqahNap5wPjif',
  'domains' => [{ 'composeId' => 'wYb0LxLQrvj2FPI21i-Oj', 'host' => 'dev.uvanoo.com',
                  'serviceName' => 'web', 'port' => 3000, 'path' => '/', 'https' => true, 'enabled' => true }]
}
verify_route = lambda do |value|
  _, _, status = Open3.capture3('jq', '-e', '--arg', 'id', fixture['composeId'], '--arg', 'host', 'dev.uvanoo.com', routing_filter, stdin_data: JSON.generate(value))
  status.success?
end
abort 'Canonical candidate routing fixture must pass' unless verify_route.call(fixture)
mutations = [
  ->(f) { f['composeId'] = 'r93MasImVQMkgJ-owMVfn' },
  ->(f) { f['appName'] = 'beaconhs-ib9ybf' },
  ->(f) { f['environmentId'] = '9eJBsiYEJm1SRMtnCro35' },
  ->(f) { f['domains'][0]['host'] = 'portal.uvanoo.com' },
  ->(f) { f['domains'] = [] },
  ->(f) { f['domains'][0]['serviceName'] = 'worker' },
  ->(f) { f['domains'][0]['port'] = 80 },
  ->(f) { f['domains'][0]['https'] = false },
  ->(f) { f['domains'][0]['enabled'] = false },
  ->(f) { f['domains'] << f['domains'][0].dup }
]
mutations.each_with_index do |mutation, index|
  invalid = Marshal.load(Marshal.dump(fixture))
  mutation.call(invalid)
  abort "Invalid candidate routing fixture #{index} was accepted" if verify_route.call(invalid)
end
abort 'Candidate routing validation must not change normal-main domain behavior' unless target_step['run'].include?('if [ "$FEATURE_CANDIDATE_VERIFIED" = true ]; then')
unless core_deploy.dig('env', 'MIGRATION_DOCKER_NETWORK') == "${{ inputs.feature_candidate_verified && 'uvanoo-dev-private' || 'infra-net' }}"
  abort 'Reusable deployment must select uvanoo-dev-private only for verified candidates and preserve infra-net for main'
end
unless core_deploy.dig('env', 'RUNTIME_DOCKER_NETWORK') == "${{ inputs.feature_candidate_verified && 'uvanoo-dev-runtime' || 'infra-net' }}"
  abort 'Reusable deployment must select uvanoo-dev-runtime only for verified candidate runtime services'
end
unless core_deploy.dig('env', 'DOKPLOY_COMPOSE_ID') == "${{ inputs.feature_candidate_verified && 'wYb0LxLQrvj2FPI21i-Oj' || secrets.DOKPLOY_COMPOSE_ID }}" &&
       core_deploy.dig('env', 'EXPECTED_DOKPLOY_STACK') == "${{ inputs.feature_candidate_verified && 'uvanoo-v1-4-dev-gniriv' || 'beaconhs-ib9ybf' }}" &&
       core_deploy.dig('env', 'EXPECTED_APP_HOST') == "${{ inputs.feature_candidate_verified && 'dev.uvanoo.com' || 'portal.uvanoo.com' }}"
  abort 'Reusable deployment must select the isolated candidate target and preserve the production target for main'
end
unless core_deploy.dig('env', 'MIGRATION_DATABASE_URL') == '${{ inputs.feature_candidate_verified && secrets.DEV_MIGRATION_DATABASE_URL || secrets.MAIN_MIGRATION_DATABASE_URL }}'
  abort 'Reusable deployment must select the candidate or normal-main migration secret from the verification flag'
end
unless core_deploy.dig('env', 'DATABASE_URL') == '${{ inputs.feature_candidate_verified && secrets.DEV_DATABASE_URL || secrets.MAIN_DATABASE_URL }}' &&
       core_deploy.dig('env', 'SUPERADMIN_DATABASE_URL') == '${{ inputs.feature_candidate_verified && secrets.DEV_SUPERADMIN_DATABASE_URL || secrets.MAIN_SUPERADMIN_DATABASE_URL }}'
  abort 'Reusable deployment must select complete candidate or normal-main runtime and maintenance bundles from the verification flag'
end
unless core_deploy.dig('env', 'EXPECTED_MIGRATION_HOST') == "${{ inputs.feature_candidate_verified && 'uvanoo-dev-postgres' || 'beaconhs-postgres' }}"
  abort 'Reusable deployment must select the matching candidate or normal-main migration host from the verification flag'
end
required_bundle_secrets = %w[
  MAIN_MIGRATION_DATABASE_URL MAIN_DATABASE_URL MAIN_SUPERADMIN_DATABASE_URL
  DEV_MIGRATION_DATABASE_URL DEV_DATABASE_URL DEV_SUPERADMIN_DATABASE_URL
]
unless required_bundle_secrets.all? { |secret| core.dig(true, 'workflow_call', 'secrets', secret, 'required') == true }
  abort 'Reusable deployment must require complete explicit three-role credential bundles'
end
bundle_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Require complete selected database credential bundle' }
abort 'Reusable deployment must reject an incomplete selected credential bundle before URL validation' unless bundle_step
unless bundle_step.dig('env', 'FEATURE_CANDIDATE_VERIFIED') == '${{ inputs.feature_candidate_verified }}' &&
       required_bundle_secrets.all? { |secret| bundle_step.dig('env', secret) == "${{ secrets.#{secret} }}" } &&
       bundle_step['run'].include?('if [ "$FEATURE_CANDIDATE_VERIFIED" = true ]; then') &&
       bundle_step['run'].include?('DEV_MIGRATION_DATABASE_URL') &&
       bundle_step['run'].include?('DEV_DATABASE_URL') &&
       bundle_step['run'].include?('DEV_SUPERADMIN_DATABASE_URL') &&
       bundle_step['run'].include?('MAIN_MIGRATION_DATABASE_URL') &&
       bundle_step['run'].include?('MAIN_DATABASE_URL') &&
       bundle_step['run'].include?('MAIN_SUPERADMIN_DATABASE_URL') &&
       bundle_step['run'].include?('Selected database credential bundle is incomplete') &&
       bundle_step['run'].include?('exit 1')
  abort 'Reusable deployment must fail before URL use when the selected three-role bundle is incomplete'
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
unless preflight_step['run'].include?('(async () => {') &&
       preflight_step['run'].include?('})().catch((error) => {') &&
       preflight_step['run'].include?('process.exit(1);')
  abort 'Three-role preflight must execute asynchronously without top-level await'
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
bundle_step_index = core_deploy.fetch('steps').index { |step| step['name'] == 'Require complete selected database credential bundle' }
url_step_index = core_deploy.fetch('steps').index { |step| step['name'] == 'Validate migration database URLs' }
abort 'Selected credential-bundle guard must run before URL validation' unless bundle_step_index && url_step_index && bundle_step_index < url_step_index
migration_env = migration_step.fetch('env')
unless migration_env['MIGRATION_DATABASE_URL'] == '${{ env.MIGRATION_DATABASE_URL }}' &&
       migration_env['DATABASE_URL'] == '${{ env.DATABASE_URL }}' &&
       migration_env['SUPERADMIN_DATABASE_URL'] == '${{ env.SUPERADMIN_DATABASE_URL }}'
  abort 'Canonical migrations must receive the same three database URLs after preflight'
end
unless url_step.dig('env', 'DATABASE_URL') == '${{ env.DATABASE_URL }}' &&
       url_step.dig('env', 'SUPERADMIN_DATABASE_URL') == '${{ env.SUPERADMIN_DATABASE_URL }}' &&
       preflight_step.dig('env', 'DATABASE_URL') == '${{ env.DATABASE_URL }}' &&
       preflight_step.dig('env', 'SUPERADMIN_DATABASE_URL') == '${{ env.SUPERADMIN_DATABASE_URL }}'
  abort 'URL validation and three-role preflight must consume the selected complete credential bundle'
end
compose_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Update the Dokploy compose environment' }
unless compose_step.dig('env', 'DATABASE_URL') == '${{ env.DATABASE_URL }}' &&
       compose_step.dig('env', 'SUPERADMIN_DATABASE_URL') == '${{ env.SUPERADMIN_DATABASE_URL }}' &&
       compose_step['run'].include?('printf \'DATABASE_URL=%s\\n\' "$DATABASE_URL"') &&
       compose_step['run'].include?('printf \'SUPERADMIN_DATABASE_URL=%s\\n\' "$SUPERADMIN_DATABASE_URL"')
  abort 'Compose updates must use the selected complete credential bundle without DEV fallback'
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

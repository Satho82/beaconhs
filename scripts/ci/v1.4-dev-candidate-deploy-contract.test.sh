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
abort 'Storage init must share the selected isolated runtime storage path' unless compose_config.dig('services', 'storage-init', 'networks') == ['runtime-db-network']
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
abort 'Runtime Redis preflight must use the pinned Node runtime without workspace mounts or application dependencies' unless
  runtime_step['run'].include?('--entrypoint node') &&
  runtime_step['run'].include?('"$MIGRATION_NODE_IMAGE" -e') &&
  !runtime_step['run'].include?('/workspace') &&
  !runtime_step['run'].include?('ioredis')
%w[REDIS_URL_TOPOLOGY REDIS_DNS_OR_TCP REDIS_AUTH_OR_PING].each do |stage|
  abort "Runtime Redis preflight must retain #{stage} diagnostics" unless runtime_step['run'].include?(stage)
end
abort 'Runtime Redis preflight must issue explicit authenticated AUTH and PING commands' unless
  runtime_step['run'].include?('["AUTH"') && runtime_step['run'].include?('["PING"]')
abort 'Runtime network diagnostics must identify the network component' unless runtime_step['run'].include?('[NETWORK_ATTRIBUTES]')
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
unless core_deploy.dig('env', 'REDIS_URL') == '${{ inputs.feature_candidate_verified && secrets.DEV_REDIS_URL || secrets.MAIN_REDIS_URL }}'
  abort 'Reusable deployment must select the candidate or normal-main Redis credential from the verification flag'
end
%w[DEV_REDIS_URL MAIN_REDIS_URL].each do |secret|
  abort "Reusable deployment must declare #{secret}" unless core.dig(true, 'workflow_call', 'secrets').key?(secret)
end
redis_url_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Validate selected Redis URL' }
abort 'Reusable deployment must validate the selected Redis credential before migrations' unless redis_url_step
unless redis_url_step.dig('env', 'FEATURE_CANDIDATE_VERIFIED') == '${{ inputs.feature_candidate_verified }}' &&
       redis_url_step.dig('env', 'REDIS_URL') == '${{ env.REDIS_URL }}' &&
       redis_url_step['run'].include?('uvanoo-dev-redis') &&
       redis_url_step['run'].include?('beaconhs-redis') &&
       redis_url_step['run'].include?('candidate && !url.password')
  abort 'Selected Redis validation must enforce context-specific topology and candidate authentication'
end
redis_url_step_index = core_deploy.fetch('steps').index(redis_url_step)
migration_step_index = core_deploy.fetch('steps').index { |step| step['name'] == 'Run database migrations' }
abort 'Selected Redis credential validation must precede migrations' unless redis_url_step_index && migration_step_index && redis_url_step_index < migration_step_index
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
storage_step = core_deploy.fetch('steps').find { |step| step['name'] == 'Select and validate storage credential bundle' }
abort 'Reusable deployment must explicitly select a storage credential bundle' unless storage_step
storage_names = %w[R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_PRIVATE_BUCKET_CONFIRMED]
storage_names.each do |name|
  abort "Reusable deployment must declare DEV_#{name}" unless core.dig(true, 'workflow_call', 'secrets').key?("DEV_#{name}")
  abort "Candidate storage selector must receive DEV_#{name}" unless storage_step.dig('env', "DEV_#{name}") == "${{ secrets.DEV_#{name} }}"
  abort "Normal-main storage selector must receive R2_#{name.delete_prefix('R2_')}" unless storage_step.dig('env', "MAIN_#{name}") == "${{ secrets.#{name} }}"
end
unless storage_step.dig('env', 'FEATURE_CANDIDATE_VERIFIED') == '${{ inputs.feature_candidate_verified }}' &&
       storage_step['run'].include?('true) storage_prefix=DEV_') &&
       storage_step['run'].include?('false) storage_prefix=MAIN_') &&
       storage_step['run'].include?('source_name="${storage_prefix}${name}"') &&
       storage_step['run'].include?('value="${!source_name}"') &&
       storage_step['run'].include?('uvanoo-dev-minio') &&
       storage_step['run'].include?('endpoint.port !== "9000"') &&
       storage_step['run'].include?('process.env.R2_BUCKET !== "uvanoo-dev"') &&
       storage_step['run'].include?('process.env.R2_PRIVATE_BUCKET_CONFIRMED !== "true"')
  abort 'Storage selector must fail closed on context and isolated candidate topology'
end
storage_step_index = core_deploy.fetch('steps').index(storage_step)
abort 'Selected storage bundle must be validated before migrations' unless storage_step_index && migration_step_index && storage_step_index < migration_step_index

run_storage_selector = lambda do |overrides|
  Dir.mktmpdir('uvanoo-storage-selector-') do |dir|
    github_env = File.join(dir, 'github-env')
    base = {
      'FEATURE_CANDIDATE_VERIFIED' => 'true',
      'GITHUB_ENV' => github_env,
      'DEV_R2_ENDPOINT' => 'http://uvanoo-dev-minio:9000',
      'DEV_R2_ACCESS_KEY_ID' => 'fixture-dev-access',
      'DEV_R2_SECRET_ACCESS_KEY' => 'fixture-dev-secret',
      'DEV_R2_BUCKET' => 'uvanoo-dev',
      'DEV_R2_PRIVATE_BUCKET_CONFIRMED' => 'true',
      'MAIN_R2_ENDPOINT' => 'https://objects.example.test',
      'MAIN_R2_ACCESS_KEY_ID' => 'fixture-main-access',
      'MAIN_R2_SECRET_ACCESS_KEY' => 'fixture-main-secret',
      'MAIN_R2_BUCKET' => 'main-bucket',
      'MAIN_R2_PRIVATE_BUCKET_CONFIRMED' => 'true'
    }
    stdout, stderr, status = Open3.capture3(base.merge(overrides), 'bash', '-c', storage_step.fetch('run'))
    [status.success?, File.exist?(github_env) ? File.read(github_env) : '', stdout + stderr]
  end
end
candidate_ok, candidate_env, = run_storage_selector.call({})
abort 'Canonical isolated DEV storage bundle must pass selection' unless candidate_ok &&
  candidate_env.include?("R2_ENDPOINT=http://uvanoo-dev-minio:9000\n") &&
  candidate_env.include?("R2_BUCKET=uvanoo-dev\n") &&
  !candidate_env.include?('fixture-main')
main_ok, main_env, = run_storage_selector.call('FEATURE_CANDIDATE_VERIFIED' => 'false')
abort 'Normal-main storage selection must remain separate from DEV' unless main_ok &&
  main_env.include?("R2_ENDPOINT=https://objects.example.test\n") &&
  main_env.include?("R2_BUCKET=main-bucket\n") &&
  !main_env.include?('fixture-dev')
storage_names.each do |name|
  ok, written, output = run_storage_selector.call("DEV_#{name}" => '')
  abort "Incomplete DEV storage bundle accepted without #{name}" if ok || !written.empty?
  abort 'Storage selector exposed a fixture secret on failure' if output.include?('fixture-dev-secret')
end
[
  { 'DEV_R2_ENDPOINT' => 'https://uvanoo-dev-minio:9000' },
  { 'DEV_R2_ENDPOINT' => 'http://portal.uvanoo.com:9000' },
  { 'DEV_R2_ENDPOINT' => 'http://uvanoo-dev-minio:9001' },
  { 'DEV_R2_ENDPOINT' => 'http://user:password@uvanoo-dev-minio:9000' },
  { 'DEV_R2_ENDPOINT' => 'http://uvanoo-dev-minio:9000/path' },
  { 'DEV_R2_BUCKET' => 'production' },
  { 'DEV_R2_PRIVATE_BUCKET_CONFIRMED' => 'false' },
  { 'DEV_R2_ACCESS_KEY_ID' => "fixture\nvalue" }
].each_with_index do |invalid, index|
  ok, = run_storage_selector.call(invalid)
  abort "Invalid candidate storage fixture #{index} was accepted" if ok
end
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
       compose_step.dig('env', 'REDIS_URL') == '${{ env.REDIS_URL }}' &&
       storage_names.all? { |name| compose_step.dig('env', name) == "${{ env.#{name} }}" } &&
       compose_step['run'].include?('printf \'DATABASE_URL=%s\\n\' "$DATABASE_URL"') &&
       compose_step['run'].include?('printf \'SUPERADMIN_DATABASE_URL=%s\\n\' "$SUPERADMIN_DATABASE_URL"') &&
       compose_step['run'].include?('printf \'REDIS_URL=%s\\n\' "$REDIS_URL"')
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

# Shell-invoked Node tests must remain visible to the dead-code gate.
require 'scripts/cluster/dev-writer-fence\.test\.mjs' knip.ts
node --test scripts/cluster/dev-writer-fence.test.mjs

ruby <<'RUBY'
require 'yaml'
require 'tmpdir'
require 'fileutils'
require 'open3'
core = YAML.safe_load(File.read('.github/workflows/deploy-dev.yml'), aliases: true)
steps = core.dig('jobs', 'deploy', 'steps')
names = [
  'Validate verified deployment identity',
  'Persist apply and verify DEV writer fence',
  'Preflight all migration database roles',
  'Run database migrations',
  'Update the Dokploy compose environment',
  'Deploy the compose on Dokploy',
  'Restore verified DEV candidate writers',
  'Wait for external readiness'
]
positions = names.map { |name| steps.index { |s| s['name'] == name } }
abort 'Writer fence ordering is incomplete or unsafe' unless positions.all? && positions == positions.sort
fence = steps[positions[1]]
restore = steps[positions[6]]
[fence, restore].each do |step|
  abort 'Fence/restore must use only the verified DEV API path under default success gating' unless
    step['if'] == 'inputs.feature_candidate_verified' &&
    !step.key?('continue-on-error') &&
    step['run'].start_with?('node .deployment-governance/scripts/cluster/dev-writer-fence.mjs ')
end
abort 'Fence must perform persist, rollout and runtime proof' unless fence['run'].end_with?(' fence')
abort 'Restore must validate candidate before raising replicas' unless restore['run'].end_with?(' restore')
migration = steps[positions[3]]
abort 'Migration must recheck zero writers before docker run' unless
  migration['run'].index('dev-writer-fence.mjs verify-zero') < migration['run'].index('docker run') &&
  migration['run'].include?('set -euo pipefail') && !migration.key?('if') && !migration.key?('continue-on-error')
steps[positions[2]..positions[5]].each do |step|
  abort 'No deployment step may ignore fence/migration failure' if step['continue-on-error'] || step['if'].to_s.match?(/always|failure|cancelled/)
end
update = steps[positions[4]]
abort 'Candidate rollout must keep writers at zero' unless update['run'].include?(%q{if [ "$FEATURE_CANDIDATE_VERIFIED" = true ]; then}) &&
  update['run'].include?(%q{printf 'WRITER_REPLICAS=0\n'})
report = steps.find { |s| s['name'] == 'Report DEV writer recovery state' }
abort 'Failure reporting must not restore or deploy anything' unless report && report['if'].include?('failure() || cancelled()') &&
  !report['run'].match?(/compose\.deploy|compose\.update|docker service|dev-writer-fence\.mjs restore/)
caller = YAML.safe_load(File.read('.github/workflows/deploy-v1.4-dev-candidate.yml'), aliases: true)
verify = caller.dig('jobs', 'verify-candidate', 'steps').find { |s| s['id'] == 'verify' }
abort 'Old candidates or old governance must not be deployed' unless verify['run'].include?(%q{"$CALLER_SHA" != "$CANDIDATE_SHA"}) &&
  verify['run'].include?(%q{git rev-parse origin/feature/uvanoo-v1.4})
# Execute the actual migration shell with a failing zero-writer guard. The
# mocked docker marker must remain absent: no database operation is allowed.
Dir.mktmpdir('dev-fence-contract-') do |dir|
  File.write("#{dir}/node", "#!/bin/sh\nexit 1\n")
  File.write("#{dir}/docker", "#!/bin/sh\ntouch \"$DOCKER_MARKER\"\n")
  FileUtils.chmod(0755, ["#{dir}/node", "#{dir}/docker"])
  _, _, status = Open3.capture3({ 'PATH' => "#{dir}:#{ENV['PATH']}", 'FEATURE_CANDIDATE_VERIFIED' => 'true',
    'DOCKER_MARKER' => "#{dir}/docker-ran" }, 'bash', '-c', migration['run'])
  abort 'Migration ran after zero-writer guard failure' if status.success? || File.exist?("#{dir}/docker-ran")
end
RUBY

echo 'PASS V1.4 candidate deployment is manual, DEV-only, digest-bound and writer-fenced'

#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

ruby <<'RUBY'
require 'yaml'
require 'json'
require 'digest'

def check(value, message)
  abort message unless value
end

path = '.github/workflows/uvanoo-v1.4-fast-dev.yml'
source = File.read(path)
workflow = YAML.safe_load(source, aliases: true)
check((workflow.keys - ['name', 'on', true, 'permissions', 'concurrency', 'jobs']).empty?, 'Unexpected workflow authority or defaults')
events = workflow['on'] || workflow[true]
check(events == { 'push' => { 'branches' => ['feature/uvanoo-v1.4'] } }, 'Fast DEV must run on feature pushes only')
check(workflow['permissions'] == { 'contents' => 'read' }, 'Fast DEV permissions must be contents: read only')
check(workflow['concurrency'] == {
  'group' => 'uvanoo-v1-4-fast-dev-${{ github.ref }}',
  'cancel-in-progress' => true
}, 'Fast DEV concurrency must be separate and cancel stale development runs')
check(workflow.fetch('jobs').keys == ['validate'], 'Fast DEV V1 must request only one runner')
job = workflow.fetch('jobs').fetch('validate')
check(job['runs-on'] == 'ubuntu-latest', 'Fast DEV must use GitHub-hosted Linux')
check(job['timeout-minutes'] == 40, 'Fast DEV timeout must be bounded')
check((job.keys - %w[name runs-on timeout-minutes services env steps]).empty?, 'Unexpected job authority or conditional')
check(!source.match?(/secrets\s*[.\[]|secrets:\s*inherit|packages:\s*write|deployments:\s*write|id-token:\s*write/), 'Fast DEV must not receive secrets or write authority')
check(!source.match?(/docker\s+(?:build|push|login)|build-push-action|ghcr\.io|uses:.*deploy.*\.yml|pnpm\s+(?:build|turbo.*build)|next\s+build/), 'Fast DEV must not compile release images or deploy')

expected_env = {
  'DATABASE_URL' => 'postgresql://beaconhs_app:beaconhs_app@localhost:5432/beaconhs_test',
  'MIGRATION_DATABASE_URL' => 'postgresql://beaconhs_migrator:beaconhs_migrator@localhost:5432/beaconhs_test',
  'SUPERADMIN_DATABASE_URL' => 'postgresql://beaconhs_super:beaconhs_super@localhost:5432/beaconhs_test',
  'DATABASE_OWNER_ROLE' => 'beaconhs_owner',
  'DATABASE_BACKUP_ROLE' => 'beaconhs_backup',
  'REDIS_URL' => 'redis://localhost:6379',
  'BETTER_AUTH_SECRET' => 'ci-secret-not-used-in-prod',
  'ATTACHMENT_CAPABILITY_SECRET' => 'ci-attachment-capability-secret-32-chars',
  'BETTER_AUTH_URL' => 'http://localhost:3000',
  'APP_URL' => 'http://localhost:3000',
  'NEXT_TELEMETRY_DISABLED' => '1'
}
check(job['env'] == expected_env, 'Only fixed disposable CI connection settings are allowed')
services = job.fetch('services')
check(services.keys.sort == %w[postgres redis], 'Only disposable PostgreSQL/Redis services allowed')
check(services['postgres']['image'] == 'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777', 'PostgreSQL service must be pinned')
check(services['redis']['image'] == 'redis:7-alpine@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99', 'Redis service must be pinned')
check(services['postgres']['env'] == { 'POSTGRES_USER' => 'postgres', 'POSTGRES_PASSWORD' => 'postgres', 'POSTGRES_DB' => 'beaconhs_test' }, 'Database must be disposable beaconhs_test')
check(services.values.all? { |s| !s.key?('volumes') && !s.key?('credentials') }, 'No persistent service mounts or credentials')

steps = job.fetch('steps')
ids = steps.map { |s| s.fetch('id') }
expected_ids = %w[checkout source pnpm node toolchain install plan classifier contract format route_types typecheck lint deadcode provision migration idempotence tests regressions aggregate]
check(ids == expected_ids, 'Broad gate set and dependency order must remain complete')
by_id = steps.to_h { |s| [s['id'], s] }
steps.each do |step|
  allowed_keys = %w[id name run uses with env]
  allowed_keys << 'if' if step['id'] == 'aggregate'
  check((step.keys - allowed_keys).empty?, "Unexpected step execution settings on #{step['id']}")
  check(!step.key?('continue-on-error'), 'No gate may hide an error')
  check(!step.key?('if') || step['id'] == 'aggregate', 'Broad gates must not be conditionally skipped')
  allowed_env = case step['id']
                when 'deadcode' then { 'NODE_OPTIONS' => '--max-old-space-size=6144' }
                when 'provision' then { 'PGPASSWORD' => 'postgres' }
                when 'aggregate' then { 'FAST_DEV_STEPS' => '${{ toJSON(steps) }}' }
                else nil
                end
  check(step['env'] == allowed_env, "Unexpected step environment on #{step['id']}")
end
actions = {
  'checkout' => 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
  'pnpm' => 'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271',
  'node' => 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e'
}
check(steps.select { |s| s.key?('uses') }.to_h { |s| [s['id'], s['uses']] } == actions, 'Only pinned checkout and toolchain actions allowed')
check(by_id['checkout']['with'] == { 'ref' => '${{ github.sha }}', 'persist-credentials' => false, 'fetch-depth' => 0 }, 'Checkout must use immutable event SHA without persistent credentials')
check(by_id['node']['with'] == { 'node-version-file' => '.nvmrc', 'cache' => 'pnpm' }, 'Use repository Node pin and pnpm store cache')
check(!by_id['pnpm'].key?('with'), 'pnpm version must come from packageManager')

commands = {
  'install' => 'pnpm install --frozen-lockfile',
  'plan' => 'node scripts/ci/v1.4-fast-dev-plan.mjs',
  'classifier' => 'node --test scripts/ci/v1.4-fast-dev-plan.test.mjs',
  'contract' => 'bash scripts/ci/v1.4-fast-dev-contract.test.sh',
  'format' => 'pnpm format:check',
  'typecheck' => 'pnpm typecheck',
  'lint' => 'pnpm lint',
  'deadcode' => 'pnpm deadcode:check',
  'migration' => 'pnpm --filter @beaconhs/db exec tsx src/migrate.ts',
  'idempotence' => 'pnpm --filter @beaconhs/db exec tsx src/migrate.ts',
  'tests' => 'pnpm test',
  'aggregate' => 'node scripts/ci/v1.4-fast-dev-plan.mjs --aggregate'
}
commands.each { |id, command| check(by_id[id]['run'] == command, "Unexpected command for #{id}") }
check(by_id['aggregate']['if'] == 'always()', 'Aggregate must inspect failed/skipped/cancelled gates')
source_check = by_id['source'].fetch('run')
['set -euo pipefail', 'test "$GITHUB_REPOSITORY" = Satho82/beaconhs',
 'test "$GITHUB_REF" = refs/heads/feature/uvanoo-v1.4',
 '[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]',
 'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"'].each { |line| check(source_check.lines.map(&:strip).include?(line), 'Missing source identity check') }
route_types = by_id['route_types'].fetch('run')
check(route_types.include?('test ! -d apps/web/.next') && route_types.include?('pnpm --filter @beaconhs/web exec next typegen') && route_types.include?('git diff --exit-code -- apps/web/tsconfig.json apps/web/next.config.ts'), 'Route types must be fresh without changing application config')
check(by_id['toolchain']['run'].include?('node --version') && by_id['toolchain']['run'].include?('pnpm --version') && by_id['toolchain']['run'].include?('.packageManager'), 'Toolchain identity must be checked')
provision = by_id['provision'].fetch('run')
['psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1',
 'CREATE ROLE beaconhs_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;',
 'CREATE ROLE beaconhs_app LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS',
 'GRANT beaconhs_owner TO beaconhs_migrator;',
 '\\connect beaconhs_test',
 'REVOKE ALL ON SCHEMA public FROM PUBLIC;'].each { |line| check(provision.include?(line), 'Disposable role provisioning contract missing') }
regressions = by_id['regressions'].fetch('run').lines.map(&:strip)
check(regressions == ['set -euo pipefail', 'scripts/cluster/dokploy-curl.test.sh', 'scripts/ci/require-current-main.test.sh', 'scripts/ci/workflow-repository-immutability.test.sh', 'scripts/ci/v1.4-dev-candidate-deploy-contract.test.sh'], 'Existing regression contracts must execute')

# Read-only fingerprints bind V1 to the reviewed release/verifier implementation.
# Future intentional release changes must update this contract explicitly.
protected_blobs = {
  '.github/workflows/uvanoo-v1.4-cloud-build.yml' => 'c4fb18afeab96f3eec53bb6dd1c6a019c6b27cce',
  '.github/workflows/deploy-v1.4-dev-candidate.yml' => '3b779b0a277f41f5ac26ada5d123e8d7e22f8798'
}
protected_blobs.each do |file, expected|
  bytes = File.binread(file)
  actual = Digest::SHA1.hexdigest("blob #{bytes.bytesize}\0" + bytes)
  check(actual == expected, "Protected authoritative workflow changed: #{file}")
end
verifier = File.read('.github/workflows/deploy-v1.4-dev-candidate.yml')
check(verifier.include?('uvanoo-v1.4-cloud-build.yml/runs?head_sha=') &&
      verifier.include?('Validate frozen V1.4 source') &&
      verifier.include?('Publish immutable V1.4 DEV candidate') &&
      !verifier.include?('uvanoo-v1.4-fast-dev'), 'Fast DEV must never approve release candidates')
RUBY

# Exercise the aggregate with every failure/cancellation/skip/missing-gate case.
node --test scripts/ci/v1.4-fast-dev-plan.test.mjs
echo 'PASS Fast DEV is broad, disposable, single-runner and cannot approve a release'

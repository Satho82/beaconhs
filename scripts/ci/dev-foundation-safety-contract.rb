#!/usr/bin/env ruby
require 'yaml'
require 'open3'
require 'digest'
w = YAML.safe_load(File.read('.github/workflows/deploy-dev.yml'), aliases: true)
caller = YAML.safe_load(File.read('.github/workflows/deploy-v1.4-dev-candidate.yml'), aliases: true)
steps = w.fetch('jobs').fetch('deploy').fetch('steps')
gate = steps.first
abort 'Approval must precede every deploy-runner action' unless gate['name'] == 'Require explicit foundation approval before DEV mutation' && gate['if'] == 'inputs.feature_candidate_verified'
['false', '', 'true'].each do |value|
  _, _, result = Open3.capture3({ 'FOUNDATION_APPROVED' => value }, 'bash', '-c', gate['run'])
  abort 'Approval fail-closed contract failed' unless result.success? == (value == 'true')
end
# Ruby YAML 1.1 interprets the Actions key "on" as true.
inputs = w.fetch(true).fetch('workflow_call').fetch('inputs')
abort 'Reusable approval must default false' unless inputs.dig('foundation_web_restore_authorized', 'default') == false
dispatch = caller.fetch(true).fetch('workflow_dispatch').fetch('inputs')
abort 'Manual owner approval missing' unless dispatch.dig('foundation_web_restore_authorized', 'default') == false
abort 'Caller failed to forward approval' unless caller.dig('jobs', 'deploy-dev', 'with', 'foundation_web_restore_authorized') == '${{ inputs.foundation_web_restore_authorized }}'
restore = steps.find { |s| s['id'] == 'writer-restore' }
abort 'Workflow may only admit web' unless restore['run'].rstrip.end_with?(' restore-web') && restore.dig('env', 'DEV_SERVICE_AUTHORIZATION') == 'restore-web'
abort 'Background admission forbidden in release workflow' if steps.any? { |s| s['run'].to_s.match?(/dev-writer-fence\.mjs restore-(worker|scheduler|collabora|storage-init)/) }
update = steps.find { |s| s['run'].to_s.include?('COMPOSE_FILE="$(cat') }
abort 'DEV-specific template missing' unless update['run'].include?('dokploy-uvanoo-foundation.compose.yaml')
%w[WEB WORKER SCHEDULER STORAGE_INIT].each do |role|
  abort "Missing persisted fence for #{role}" unless update['run'].include?("#{role}_REPLICAS=0\\n")
end
# Collabora is separately fenced and drained before admission. The updater must
# preserve its full previously saved spec and verify rendered parity.
run = update.fetch('run')
abort 'Saved sidecar must be fetched and verified before mutation' unless
  run.index('/api/compose.one') && run.index('preserve-dev-sidecar.mjs') &&
  run.index('/api/compose.one') < run.index('preserve-dev-sidecar.mjs') &&
  run.index('preserve-dev-sidecar.mjs') < run.index('/api/compose.update')
guard = File.read('scripts/cluster/preserve-dev-sidecar.mjs')
abort 'Preservation must reject active Collabora and rendered drift' unless
  guard.include?("SIDECAR_NOT_FENCED") && guard.include?("SIDECAR_RENDER_DRIFT") &&
  guard.include?("oldSidecar?.deploy?.replicas === 0")
admission = File.read('packages/db/src/dev-temporary-admission.ts')
adapter = File.read('packages/db/src/dev-safety-monitor.ts')
abort 'Collabora drainage must be mandatory and include save coverage' unless
  admission.include?("'collaboraDrainage'") &&
  adapter.include?("collaboraDrainage:") && adapter.include?("saveCoverageComplete: 'true'") &&
  adapter.include?("failedSaves: 'zero'")
# Preserve the exact already-approved f535 legacy-path template; do not silently
# present it as equal to the earlier PR10 baseline. The earlier divergence is
# locked independently so it cannot drift or disappear without explicit review.
legacy_path = 'deploy/dokploy-dev.compose.yaml'
legacy_current_sha = 'f5354c6554607694575e959d183e0e7732782b3f'
legacy_prior_sha = 'b11778aee65e3a6818fed58d4927070165746e1b'
known_divergence_sha256 = '052eed4325295f4b1bb03f06df92301a64853c06e822c0be9c883246d193052d'
locked, locked_status = Open3.capture2('git', 'show', "#{legacy_current_sha}:#{legacy_path}")
historic_delta, delta_status = Open3.capture2('git', 'diff', '--binary', legacy_prior_sha, legacy_current_sha, '--', legacy_path)
abort 'Legacy current reference unavailable' unless locked_status.success? && !locked.empty?
abort 'Historical legacy divergence differs from reviewed fingerprint' unless
  delta_status.success? && Digest::SHA256.hexdigest(historic_delta) == known_divergence_sha256
matches_locked = ->(value) { value == locked }
actual = File.read(legacy_path)
abort 'Legacy template differs from approved exact-current snapshot' unless matches_locked.call(actual)
abort 'Legacy mutation detection failed' if matches_locked.call(actual + "# mutation\n")

puts 'PASS foundation approval, four writer controls, fenced and verified sidecar preservation, exact-current legacy snapshot and pinned prior divergence'

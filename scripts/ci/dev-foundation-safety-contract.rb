#!/usr/bin/env ruby
require 'yaml'
require 'open3'
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
%w[WEB WORKER SCHEDULER STORAGE_INIT COLLABORA].each do |role|
  abort "Missing persisted fence for #{role}" unless update['run'].include?("#{role}_REPLICAS=0\\n")
end
# Legacy template must remain byte-identical to PR10.
original, status = Open3.capture2('git', 'show', 'b11778aee65e3a6818fed58d4927070165746e1b:deploy/dokploy-dev.compose.yaml')
abort 'Legacy template changed' unless status.success? && original == File.read('deploy/dokploy-dev.compose.yaml')
puts 'PASS foundation approval, web-only workflow, five persistent controls and unchanged legacy template'

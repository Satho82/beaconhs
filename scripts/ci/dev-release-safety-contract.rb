#!/usr/bin/env ruby
require 'yaml'
require 'open3'
require 'tmpdir'
require 'fileutils'
w = YAML.safe_load(File.read('.github/workflows/deploy-dev.yml'), aliases: true)
steps = w.fetch('jobs').fetch('deploy').fetch('steps')
lookup = ->(name) { steps.find { |s| s['name'] == name } || abort("Missing #{name}") }
cleanup = lookup.call('Reclaim stale deployment-runner storage')
branding = lookup.call('Install Collabora branding on the swarm manager')
[cleanup, branding].each { |s| abort 'Shared-host mutation allowed for DEV' unless s['if'] == '${{ !inputs.feature_candidate_verified }}' }
space = lookup.call('Check DEV free space without shared-host cleanup')
abort 'DEV space check must be read-only' unless space['if'] == 'inputs.feature_candidate_verified' && !space['run'].match?(/prune|docker service|rm -/)
readiness = lookup.call('Wait for external readiness')
refence = lookup.call('Re-fence DEV writers after release failure')
abort 'Failure re-fence must follow readiness and propagate failure' unless steps.index(refence) > steps.index(readiness) && !refence.key?('continue-on-error')
expected = "${{ always() && inputs.feature_candidate_verified && (failure() || cancelled()) && steps.writer-fence.outcome != 'skipped' && steps.writer-fence.outcome != '' }}"
abort 'Invalid failure/cancellation or DEV fence scope' unless refence['if'] == expected
abort 'Re-fence must use canonical DEV helper' unless refence['run'] == 'node .deployment-governance/scripts/cluster/dev-writer-fence.mjs fence'
Dir.mktmpdir do |dir|
  File.write("#{dir}/node", "#!/bin/sh\nprintf '%s\\n' \"$*\" > \"$CALL_LOG\"\nexit \"$FENCE_EXIT\"\n")
  FileUtils.chmod(0755, "#{dir}/node")
  [0, 1].each do |code|
    _, _, result = Open3.capture3({ 'PATH' => "#{dir}:#{ENV['PATH']}", 'FENCE_EXIT' => code.to_s, 'CALL_LOG' => "#{dir}/calls" }, 'bash', '-e', '-c', refence['run'])
    abort 'Re-fence swallowed failure or invoked restore' unless result.exitstatus == code && File.read("#{dir}/calls").strip.end_with?('dev-writer-fence.mjs fence')
  end
end
puts 'PASS DEV-only no-prune/no-branding, post-readiness failure re-fence and error propagation'

#!/usr/bin/env ruby
require 'yaml'
require 'open3'
require 'tmpdir'
require 'fileutils'
w = YAML.safe_load(File.read('.github/workflows/deploy-dev.yml'), aliases: true)
caller = YAML.safe_load(File.read('.github/workflows/deploy-v1.4-dev-candidate.yml'), aliases: true)
steps = w.fetch('jobs').fetch('deploy').fetch('steps')
find = ->(name) { steps.find { |s| s['name'] == name } || abort("Missing step: #{name}") }
migration = find.call('Run database migrations')
preflight = find.call('Preflight all migration database roles')
early = find.call('Verify DEV admission before writer mutations')
fence = steps.find { |s| s['id'] == 'writer-fence' }
restore = steps.find { |s| s['id'] == 'writer-restore' }
abort 'Early gate must be DEV-only and before fence' unless early['if'] == 'inputs.feature_candidate_verified' && steps.index(early) < steps.index(fence)
abort 'Read-only evidence missing from actual migration container' unless migration['run'].include?('"${evidence_mount[@]}"') && migration['run'].include?('/release-evidence:ro')
abort 'Evidence mounted into unrelated preflight' if preflight['run'].include?('release-evidence')
abort 'Main path must not mount DEV evidence' unless migration['run'].match?(/evidence_mount=\(\).*if \[ "\$FEATURE_CANDIDATE_VERIFIED" = true \]; then.*evidence_mount=\(-v .*\/release-evidence:ro"\).*fi.*docker run/m)
abort 'Web admission must precede scaling, with shell fail-fast' unless restore['if'] == 'inputs.feature_candidate_verified' && restore['run'].lines.map(&:strip) == ['set -euo pipefail','bash scripts/cluster/verify-dev-release-admission.sh web','node .deployment-governance/scripts/cluster/dev-writer-fence.mjs restore-web']
%w[DEV_TEMPORARY_APPROVAL_SHA256 DEV_RELEASE_ENVIRONMENT GITHUB_REPOSITORY DOKPLOY_COMPOSE_ID EXPECTED_DOKPLOY_STACK EXPECTED_APP_HOST EXPECTED_MIGRATION_HOST MIGRATION_DOCKER_NETWORK].each do |key|
  abort "Missing migration context #{key}" unless migration['run'].include?("-e #{key}")
end
abort 'Owner pin not forwarded' unless caller.dig('jobs','deploy-dev','with','temporary_dev_approval_sha256') == '${{ inputs.temporary_dev_approval_sha256 }}'
abort 'Owner pin cannot default to an approval' unless w.dig(true,'workflow_call','inputs','temporary_dev_approval_sha256','default') == ''
helper = File.read('scripts/cluster/verify-dev-release-admission.sh')
abort 'Guard helper must be scoped and read-only' unless helper.include?('set -euo pipefail') && helper.include?('--read-only') && helper.include?('$evidence_dir:/release-evidence:ro') && helper.include?('uvanoo-dev-private') && !helper.match?(/--privileged|--publish|service update/)
Dir.mktmpdir('dev-web-admission-failure-') do |dir|
  File.write("#{dir}/node", "#!/bin/sh\ntouch \"$MUTATION_MARKER\"\n")
  FileUtils.chmod(0755,"#{dir}/node")
  _,_,status=Open3.capture3({'PATH'=>"#{dir}:#{ENV['PATH']}", 'FEATURE_CANDIDATE_VERIFIED'=>'true', 'DEV_RELEASE_ENVIRONMENT'=>'production', 'MUTATION_MARKER'=>"#{dir}/mutation"},'bash','-c',restore['run'])
  abort 'Failed web admission reached service mutation' if status.success? || File.exist?("#{dir}/mutation")
end
original,status=Open3.capture2('git','show','bc7b03c602886e2b64ec7746156f7e7ea8611e8c:packages/db/src/dev-migration-identities.json')
require 'json'
before=JSON.parse(original); after=JSON.parse(File.read('packages/db/src/dev-migration-identities.json'))
abort 'Historical lock changed' unless status.success? && before.length==after.length && before.zip(after).each_with_index.all? { |(a,b),i| [59,60].include?(i) ? a.reject { |k,_| k=='blob' }==b.reject { |k,_| k=='blob' } : a==b }
puts 'PASS DEV-only early/web boundaries, exact migration mount, owner pin, immutable historical lock and unrelated preflight isolation'

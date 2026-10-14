require 'yaml'
require 'json'
require 'digest'

def check(value, message)
  abort message unless value
end
def load_yaml(bytes)
  YAML.safe_load(bytes, aliases: true)
end
path = '.github/workflows/uvanoo-v1.4-cloud-build.yml'
current = load_yaml(File.read(path))
events = current['on'] || current[true]
check(events.delete('workflow_call') == {
  'inputs' => { 'source_sha' => {
    'description' => 'Exact isolated source to validate and publish; never deploys',
    'required' => true, 'type' => 'string'
  }}
}, 'Reusable build entry must accept only an exact source SHA, no secrets')
# Canonical YAML-object fingerprint of the reviewed c34a1b5 workflow; works in
# shallow CI without fetching or trusting a mutable ref.
check(Digest::SHA256.hexdigest(JSON.generate(current)) == '5a564a85e5b30d71db277985d4db941877808b0845f874d24b8403803dd5c532',
  'Existing build gates, permissions and feature events must remain unchanged')

wrapper = load_yaml(File.read('.github/workflows/dev-execution-gates.yml'))
check((wrapper['on'] || wrapper[true]) == {
  'push' => { 'branches' => ['fix/uvanoo-dev-maintenance-hold-20261014'] }
}, 'Only isolated branch pushes may start this workflow')
check(wrapper['permissions'] == { 'contents' => 'read', 'packages' => 'write' }, 'Image-only write authority')
check(wrapper['jobs'] == {
  'validate-and-build' => {
    'if' => "github.repository == 'Satho82/beaconhs' && github.ref == 'refs/heads/fix/uvanoo-dev-maintenance-hold-20261014'",
    'uses' => './.github/workflows/uvanoo-v1.4-cloud-build.yml',
    'with' => { 'source_sha' => '${{ github.sha }}' }
  }
}, 'No deploy job, mutable checkout, environment or secrets inheritance allowed')
puts 'PASS isolated publication reuses unchanged full CI/image jobs and cannot deploy'

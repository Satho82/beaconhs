import { requireValue as check } from './release.mjs'
const { SOURCE: source, EXECUTE: execute } = process.env
try {
  check(/^[a-f0-9]{40}$/.test(source), 'INVALID_SOURCE')
  // GitHub workflow dispatch does not return a run ID. Correlating by SHA and
  // timestamp can select a competing run, so execution must use the existing
  // governed workflow directly until unique dispatch correlation is available.
  check(execute !== 'true', 'CONTROLLED_DIRECT_WORKFLOW_REQUIRED')
  console.log(
    JSON.stringify({
      mode: 'controlled',
      status: 'DRY_RUN',
      source,
      checks: [
        'migration compatibility',
        'encrypted backup',
        'verified restore or rollback',
        'tenant and storage checks',
        'existing source-bound admission',
      ],
      destructiveChanges: 'separate explicit approval required',
      existingMechanismRetained: true,
    }),
  )
} catch (error) {
  console.error(
    /^[A-Z_]+$/.test(error.message) ? error.message : 'CONTROLLED_ADMISSION_FAILED_OR_INCOMPLETE',
  )
  process.exitCode = 1
}

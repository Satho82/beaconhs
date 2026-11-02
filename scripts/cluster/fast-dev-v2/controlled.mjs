import { execFileSync } from 'node:child_process'
import { TARGET, requireValue as check } from './release.mjs'
const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })
const { SOURCE: source, EVIDENCE: evidence, APPROVAL: approval, EXECUTE: execute } = process.env
try {
  check(/^[a-f0-9]{40}$/.test(source), 'INVALID_SOURCE')
  if (execute !== 'true') {
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
  } else {
    check(
      /^[a-f0-9]{64}$/.test(evidence) && (!approval || /^[a-f0-9]{64}$/.test(approval)),
      'CONTROLLED_APPROVAL_REQUIRED',
    )
    const started = new Date().toISOString()
    gh(
      'workflow',
      'run',
      'deploy-v1.4-dev-candidate.yml',
      '--repo',
      TARGET.repository,
      '--ref',
      'feature/uvanoo-v1.4',
      '-f',
      `source_sha=${source}`,
      '-f',
      `release_evidence_sha256=${evidence}`,
      '-f',
      `temporary_dev_approval_sha256=${approval ?? ''}`,
      '-f',
      'foundation_web_restore_authorized=true',
    )
    let run
    for (let i = 0; i < 24; i++) {
      const result = JSON.parse(
        gh(
          'api',
          `repos/${TARGET.repository}/actions/workflows/deploy-v1.4-dev-candidate.yml/runs?event=workflow_dispatch&per_page=100`,
        ),
      )
      const candidates = result.workflow_runs.filter(
        (r) => r.head_sha === source && r.created_at >= started.slice(0, 19) + 'Z',
      )
      check(candidates.length <= 1, 'CONTROLLED_RUN_AMBIGUOUS')
      if (candidates.length === 1) {
        run = candidates[0]
        break
      }
      await new Promise((done) => setTimeout(done, 5000))
    }
    check(run, 'CONTROLLED_RUN_NOT_FOUND')
    console.log(`Controlled admission run: ${run.html_url}`)
    // Poll bounded requests; the overall workflow has a 90-minute timeout.
    let completed = false
    for (let i = 0; i < 510; i++) {
      const state = JSON.parse(gh('api', `repos/${TARGET.repository}/actions/runs/${run.id}`))
      if (state.status === 'completed') {
        check(state.conclusion === 'success', 'CONTROLLED_RUN_FAILED')
        completed = true
        break
      }
      await new Promise((done) => setTimeout(done, 10000))
    }
    check(completed, 'CONTROLLED_RUN_TIMEOUT')
    console.log('CONTROLLED_WORKFLOW_SUCCEEDED')
  }
} catch {
  console.error('CONTROLLED_ADMISSION_FAILED_OR_INCOMPLETE')
  process.exitCode = 1
}

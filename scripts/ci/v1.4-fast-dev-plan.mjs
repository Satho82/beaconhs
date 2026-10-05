import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const BASELINE = '3f564ab9f9d9a74c7ada3c572580119e7e460350'
export const REQUIRED_STEPS = [
  'checkout',
  'source',
  'pnpm',
  'node',
  'toolchain',
  'install',
  'plan',
  'classifier',
  'contract',
  'format',
  'route_types',
  'typecheck',
  'lint',
  'deadcode',
  'provision',
  'migration',
  'idempotence',
  'tests',
  'regressions',
]

// Categories report impact; V1 deliberately never narrows the executed gates.
export function classifyPath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.startsWith('/') ||
    path.split('/').includes('..') ||
    /[\x00-\x1f\x7f\\]/.test(path)
  ) {
    return ['SHARED / UNKNOWN']
  }
  if (path === 'README.md' || /^docs\/(?:screenshots|user-guide)\/[^\n]+\.md$/.test(path)) {
    return ['DOCS ONLY']
  }
  const categories = new Set()
  const add = (condition, name) => {
    if (condition) categories.add(name)
  }
  add(
    /^apps\/web\/src\/.*\.css$/.test(path) ||
      /^apps\/web\/public\/.*\.(png|jpe?g|webp|ico|woff2?)$/.test(path),
    'UI PRESENTATION',
  )
  add(path.startsWith('apps/web/'), 'WEB LOGIC')
  add(path.startsWith('packages/ui/'), 'SHARED UI')
  add(
    path.startsWith('packages/db/') ||
      path.startsWith('scripts/db/') ||
      path === 'scripts/cluster/provision.sql',
    'DATABASE',
  )
  add(
    /^packages\/(auth|tenant)\//.test(path) ||
      /^packages\/db\/src\/.*(?:rls|property|tenant)/.test(path) ||
      /^apps\/web\/src\/lib\/(?:auth\.|api\/|access-delegation|role-assignment|module-entitlements\/|nav\/|.*property.*)/.test(
        path,
      ) ||
      /^apps\/web\/src\/app\/\(platform\)\/platform\/tenants\//.test(path),
    'RLS / AUTHORIZATION',
  )
  add(/^apps\/worker\//.test(path) || /^packages\/(jobs|events)\//.test(path), 'WORKER')
  add(path.startsWith('packages/storage/') || /(?:storage|attachment|upload)/.test(path), 'STORAGE')
  add(
    path.startsWith('apps/web/src/lib/imports/') ||
      path.startsWith('apps/web/src/app/(app)/admin/settings/import-export/'),
    'IMPORTS',
  )
  add(
    path.startsWith('.github/') ||
      /^scripts\/(ci|cluster)\//.test(path) ||
      /^(?:Dockerfile|docker\/|deploy\/)/.test(path),
    'WORKFLOW / DEPLOYMENT',
  )
  if (!categories.size) categories.add('SHARED / UNKNOWN')
  return [...categories].sort()
}

// --name-status -z preserves spaces and records both sides of renames/copies.
export function parseChanges(output) {
  const fields = output.split('\0')
  if (fields.at(-1) === '') fields.pop()
  const changes = []
  while (fields.length) {
    const status = fields.shift()
    if (!/^(?:[ADMTUXB]|[RC][0-9]{1,3})$/.test(status ?? '')) {
      throw new Error('Invalid Git change record')
    }
    const count = /^[RC]/.test(status) ? 2 : 1
    if (fields.length < count) throw new Error('Incomplete Git change record')
    changes.push({ status, paths: fields.splice(0, count) })
  }
  return changes
}

export function makePlan({ changes = [], baseline = null, ancestry = false, error = null } = {}) {
  const categories = new Set(changes.flatMap((change) => change.paths.flatMap(classifyPath)))
  const reasons = []
  if (!baseline) reasons.push('missing comparison baseline')
  if (!ancestry) reasons.push('missing or discontinuous ancestry')
  if (error) reasons.push('comparison failed')
  if (!changes.length) reasons.push('empty comparison')
  if (categories.has('SHARED / UNKNOWN')) reasons.push('unknown or shared impact')
  if (reasons.length) categories.add('SHARED / UNKNOWN')
  return {
    version: 1,
    mode: 'broad-non-build',
    baseline,
    categories: [...categories].sort(),
    fallbackReasons: reasons,
    changes,
    requiredSteps: [...REQUIRED_STEPS],
    releaseApproved: false,
  }
}

export function assertAggregate(steps) {
  const failed = REQUIRED_STEPS.filter(
    (id) => steps?.[id]?.outcome !== 'success' || steps?.[id]?.conclusion !== 'success',
  )
  if (failed.length) throw new Error(`Required validation did not succeed: ${failed.join(', ')}`)
  return 'FAST DEV GREEN ≠ RELEASE APPROVED'
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function main() {
  if (process.argv[2] === '--aggregate') {
    const result = assertAggregate(JSON.parse(process.env.FAST_DEV_STEPS ?? '{}'))
    console.log(result)
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${result}\n`)
    return
  }
  const sha = process.env.GITHUB_SHA ?? ''
  const repository = process.env.GITHUB_REPOSITORY
  const ref = process.env.GITHUB_REF
  if (
    repository !== 'Satho82/beaconhs' ||
    ref !== 'refs/heads/feature/uvanoo-v1.4' ||
    !/^[0-9a-f]{40}$/.test(sha) ||
    git('rev-parse', 'HEAD').trim() !== sha
  ) {
    throw new Error('Fast DEV source identity could not be established')
  }
  let comparison
  try {
    git('cat-file', '-e', `${BASELINE}^{commit}`)
    git('merge-base', '--is-ancestor', BASELINE, sha)
    comparison = makePlan({
      baseline: BASELINE,
      ancestry: true,
      changes: parseChanges(
        git('diff', '--name-status', '-z', '--find-renames', BASELINE, sha, '--'),
      ),
    })
  } catch {
    comparison = makePlan({ baseline: BASELINE, error: true })
  }
  const result = { repository, ref, sha, ...comparison }
  console.log(JSON.stringify(result, null, 2))
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n### Fast DEV source and plan\n\nRepository: ${repository}\n\nRef: ${ref}\n\nSHA: ${sha}\n\nComparison baseline: ${BASELINE}\n\nPlan: ${result.mode}\n\nCategories: ${result.categories.join(', ')}\n\nFallback: ${result.fallbackReasons.join('; ') || 'not needed'}\n\nAll broad gates remain mandatory, including docs-only changes in V1.\n\nFAST DEV GREEN ≠ RELEASE APPROVED\n`,
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BASELINE,
  REQUIRED_STEPS,
  classifyPath,
  parseChanges,
  makePlan,
  assertAggregate,
} from './v1.4-fast-dev-plan.mjs'

const examples = [
  ['README.md', 'DOCS ONLY'],
  ['docs/user-guide/maintenance.md', 'DOCS ONLY'],
  ['apps/web/src/app/globals.css', 'UI PRESENTATION'],
  ['apps/web/src/components/button.tsx', 'WEB LOGIC'],
  ['apps/web/src/app/api/example/route.ts', 'WEB LOGIC'],
  ['packages/ui/src/button.tsx', 'SHARED UI'],
  ['packages/db/drizzle/0055_example.sql', 'DATABASE'],
  ['packages/auth/src/index.ts', 'RLS / AUTHORIZATION'],
  ['packages/db/src/rls.ts', 'RLS / AUTHORIZATION'],
  ['apps/web/src/lib/module-entitlements/server.ts', 'RLS / AUTHORIZATION'],
  ['apps/web/src/lib/nav/registry.ts', 'RLS / AUTHORIZATION'],
  ['apps/worker/src/workers/email.ts', 'WORKER'],
  ['packages/storage/src/index.ts', 'STORAGE'],
  ['apps/web/src/lib/imports/engine.ts', 'IMPORTS'],
  ['.github/workflows/deploy-dev.yml', 'WORKFLOW / DEPLOYMENT'],
  ['package.json', 'SHARED / UNKNOWN'],
  ['new-area/unknown.bin', 'SHARED / UNKNOWN'],
  ['AGENTS.md', 'SHARED / UNKNOWN'],
  ['docs/UVANOO-V1.4-FAST-DEV-CI.md', 'SHARED / UNKNOWN'],
]
for (const [path, category] of examples) {
  test(`classifies ${path} without reducing gates`, () => {
    assert.ok(classifyPath(path).includes(category))
    const plan = makePlan({
      baseline: BASELINE,
      ancestry: true,
      changes: [{ status: 'M', paths: [path] }],
    })
    assert.equal(plan.mode, 'broad-non-build')
    assert.deepEqual(plan.requiredSteps, REQUIRED_STEPS)
    assert.equal(plan.releaseApproved, false)
  })
}
test('mixed changes receive the union, including docs plus code', () => {
  const plan = makePlan({
    baseline: BASELINE,
    ancestry: true,
    changes: parseChanges(
      'M\0README.md\0M\0packages/storage/src/index.ts\0M\0packages/db/src/rls.ts\0',
    ),
  })
  for (const category of ['DOCS ONLY', 'STORAGE', 'DATABASE', 'RLS / AUTHORIZATION']) {
    assert.ok(plan.categories.includes(category))
  }
})
test('renames retain both original and destination impact', () => {
  const changes = parseChanges('R100\0packages/auth/src/old.ts\0docs/user-guide/new.md\0')
  const plan = makePlan({ baseline: BASELINE, ancestry: true, changes })
  assert.ok(plan.categories.includes('RLS / AUTHORIZATION'))
  assert.ok(plan.categories.includes('DOCS ONLY'))
})
test('deleted files retain their impact', () => {
  const changes = parseChanges('D\0packages/db/src/rls.ts\0')
  assert.equal(changes[0].status, 'D')
  assert.ok(
    makePlan({ baseline: BASELINE, ancestry: true, changes }).categories.includes('DATABASE'),
  )
})
test('space-containing paths remain single records', () => {
  assert.deepEqual(parseChanges('M\0docs/user-guide/a guide.md\0')[0].paths, [
    'docs/user-guide/a guide.md',
  ])
})
test('malformed records fail rather than omit changed files', () => {
  for (const input of ['R100\0old.ts\0', 'M\0', 'BAD\0file\0'])
    assert.throws(() => parseChanges(input))
})
for (const [name, input] of [
  ['missing comparison baseline', {}],
  ['force-push/discontinuous ancestry', { baseline: BASELINE, ancestry: false }],
  ['comparison error', { baseline: BASELINE, ancestry: true, error: true }],
  ['empty comparison', { baseline: BASELINE, ancestry: true }],
]) {
  test(`${name} selects broad fallback`, () => {
    const plan = makePlan(input)
    assert.ok(plan.categories.includes('SHARED / UNKNOWN'))
    assert.ok(plan.fallbackReasons.length)
    assert.deepEqual(plan.requiredSteps, REQUIRED_STEPS)
  })
}
test('unsafe path syntax is unknown, never docs-only', () => {
  for (const path of [
    '../README.md',
    '/README.md',
    'docs/user-guide/../policy.md',
    'docs/user-guide/a\nb.md',
  ]) {
    assert.deepEqual(classifyPath(path), ['SHARED / UNKNOWN'])
  }
})
const successfulSteps = () =>
  Object.fromEntries(
    REQUIRED_STEPS.map((id) => [id, { outcome: 'success', conclusion: 'success' }]),
  )
test('aggregate accepts only every required gate succeeding', () => {
  assert.match(assertAggregate(successfulSteps()), /≠ RELEASE APPROVED/)
})
for (const status of ['failure', 'cancelled', 'skipped', undefined]) {
  test(`aggregate rejects every required gate when ${status}`, () => {
    for (const id of REQUIRED_STEPS) {
      const steps = successfulSteps()
      if (status) steps[id] = { outcome: status, conclusion: status }
      else delete steps[id]
      assert.throws(() => assertAggregate(steps), new RegExp(id))
    }
  })
}
test('continue-on-error cannot convert a failed gate to success', () => {
  const steps = successfulSteps()
  steps.tests = { outcome: 'failure', conclusion: 'success' }
  assert.throws(() => assertAggregate(steps), /tests/)
})
test('CLI rejects incorrect source identity', () => {
  assert.throws(() =>
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL('./v1.4-fast-dev-plan.mjs', import.meta.url))],
      {
        env: { ...process.env, GITHUB_REPOSITORY: 'wrong/repo' },
        stdio: 'pipe',
      },
    ),
  )
})
test('CLI falls back broadly on a real unrelated Git history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fast-dev-history-'))
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim()
  try {
    git('init', '-q')
    writeFileSync(join(dir, 'README.md'), 'fixture\n')
    git('add', 'README.md')
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture',
    )
    const sha = git('rev-parse', 'HEAD')
    const output = execFileSync(
      process.execPath,
      [fileURLToPath(new URL('./v1.4-fast-dev-plan.mjs', import.meta.url))],
      {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_REPOSITORY: 'Satho82/beaconhs',
          GITHUB_REF: 'refs/heads/feature/uvanoo-v1.4',
          GITHUB_SHA: sha,
          GITHUB_STEP_SUMMARY: '',
        },
      },
    )
    const plan = JSON.parse(output)
    assert.equal(plan.sha, sha)
    assert.equal(plan.mode, 'broad-non-build')
    assert.ok(plan.fallbackReasons.includes('comparison failed'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

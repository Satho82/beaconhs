import test from 'node:test'
import assert from 'node:assert/strict'
import { plan, patchEnv, release, TARGET } from './release.mjs'
const base = 'a'.repeat(40),
  sha = 'b'.repeat(40),
  digest = 'sha256:' + 'c'.repeat(64)
const request = {
  repository: TARGET.repository,
  sha,
  digest,
  execute: true,
  enabled: true,
  authorized: true,
  compatible: true,
}
function fixture(failures = {}) {
  const calls = [],
    counts = {}
  const io = {}
  for (const method of [
    'verifyCI',
    'verifyImage',
    'preflight',
    'smoke',
    'assertUnchanged',
    'persist',
    'rollout',
    'ready',
    'checkPaused',
    'record',
  ]) {
    io[method] = async (...args) => {
      calls.push([method, ...args])
      counts[method] = (counts[method] ?? 0) + 1
      if (failures[method]?.includes(counts[method])) throw new Error('SIMULATED_FAILURE')
    }
  }
  io.snapshot = async () => ({ sha: base, digest })
  io.diff = async () => ({
    changes: 'M\0apps/web/src/app/(app)/hospitality/handover/page.tsx\0',
    ancestor: true,
  })
  return { io, calls }
}
for (const path of [
  'apps/web/package.json',
  'apps/web/next.config.ts',
  'apps/web/.env',
  'packages/ui/package.json',
  'packages/db/src/schema/a.ts',
  'packages/tenant/src/index.ts',
  '.github/workflows/deploy-dev.yml',
  'apps/web/src/lib/auth.ts',
  'apps/web/src/lib/wopi.ts',
  'pnpm-lock.yaml',
  'apps/worker/src/index.ts',
  'packages/storage/src/index.ts',
]) {
  test(`controlled: ${path}`, () =>
    assert.equal(plan(base, sha, `M\0${path}\0`, true).mode, 'controlled'))
}
test('rename out of sensitive path remains controlled', () =>
  assert.equal(
    plan(base, sha, 'R100\0packages/db/a.ts\0apps/web/a.tsx\0', true).mode,
    'controlled',
  ))
test('non-ancestor fails to controlled', () =>
  assert.equal(plan(base, sha, '', false).mode, 'controlled'))
test('routine application plan', () =>
  assert.equal(plan(base, sha, 'M\0apps/web/src/components/button.tsx\0', true).mode, 'fast'))
test('environment patch rejects duplicates and preserves secrets', () => {
  assert.equal(
    patchEnv('IMAGE=old\nSECRET=untouched\n', { IMAGE: 'new' }),
    'IMAGE=new\nSECRET=untouched\n',
  )
  assert.throws(() => patchEnv('IMAGE=x\nIMAGE=y', { IMAGE: 'z' }))
})
test('dry run never mutates or performs write smoke', async () => {
  const { io, calls } = fixture()
  assert.equal((await release(io, { ...request, execute: false })).status, 'DRY_RUN')
  assert(!calls.some(([method]) => ['persist', 'rollout', 'smoke'].includes(method)))
})
test('successful rollout runs preflight and post-activation smoke', async () => {
  const { io, calls } = fixture()
  assert.equal((await release(io, request)).status, 'VERIFIED')
  assert.deepEqual(
    calls.filter(([method]) => method === 'smoke').map((c) => c[2]),
    [false, true],
  )
})
for (const gate of ['verifyCI', 'verifyImage', 'preflight', 'smoke', 'assertUnchanged']) {
  test(`${gate} failure never mutates`, async () => {
    const { io, calls } = fixture({ [gate]: [1] })
    await assert.rejects(release(io, request))
    assert(!calls.some(([method]) => method === 'persist' || method === 'rollout'))
  })
}
for (const gate of ['persist', 'rollout', 'ready', 'checkPaused']) {
  test(`${gate} failure restores previous image`, async () => {
    const { io, calls } = fixture({ [gate]: [1] })
    await assert.rejects(release(io, request), /ACTIVATION_FAILED_ROLLBACK_VERIFIED/)
    assert(calls.some(([method, state]) => method === 'rollout' && state.sha === base))
  })
}
test('post-deploy smoke failure rolls back', async () => {
  const { io } = fixture({ smoke: [2] })
  await assert.rejects(release(io, request), /ROLLBACK_VERIFIED/)
})
test('rollback failure never reports success', async () => {
  const { io } = fixture({ ready: [1, 2] })
  await assert.rejects(release(io, request), /ROLLBACK_INCOMPLETE_OPERATOR_REQUIRED/)
})
for (const field of ['enabled', 'authorized', 'compatible']) {
  test(`${field} required before mutation`, async () => {
    const { io, calls } = fixture()
    await assert.rejects(release(io, { ...request, [field]: false }), /OWNER_ENABLEMENT/)
    assert(!calls.some(([m]) => m === 'persist'))
  })
}
test('controlled changes cannot execute FAST', async () => {
  const { io, calls } = fixture()
  io.diff = async () => ({ changes: 'M\0packages/db/schema.ts\0', ancestor: true })
  await assert.rejects(release(io, request), /CONTROLLED_ADMISSION/)
  assert(!calls.some(([m]) => m === 'persist'))
})
test('wrong repository rejected', async () => {
  await assert.rejects(
    release(fixture().io, { ...request, repository: 'other/repo' }),
    /WRONG_REPOSITORY/,
  )
})

test('streaming auth redirect requires both exact Next markers', async () => {
  const { isStreamingLoginRedirect } = await import('./streaming-redirect.mjs')
  const meta = '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/login"/>'
  const digest = 'NEXT_REDIRECT;replace;/login;307;'
  assert(isStreamingLoginRedirect(meta + digest))
  assert(!isStreamingLoginRedirect(meta))
  assert(!isStreamingLoginRedirect(digest))
  assert(
    !isStreamingLoginRedirect((meta + digest).replaceAll('/login', 'https://evil.invalid/login')),
  )
  assert(!isStreamingLoginRedirect('<h1>Private records</h1>'))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checkPropertyIsolation, payloadContainsSentinel } from './isolation.mjs'
import { assertAuthoritativeIdentity, assertVerifierIntegrity } from './identity.mjs'
import {
  assertBuildProvenance,
  assertLiveFastSafety,
  assertRecoverySourceBinding,
  plan,
  patchEnv,
  persistConfiguration,
  release,
  TARGET,
} from './release.mjs'
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
    'verifyActivationSafety',
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
    changes: 'M\0apps/web/public/images/logo.png\0',
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
test('explicit static asset plan', () =>
  assert.equal(plan(base, sha, 'M\0apps/web/public/images/logo.png\0', true).mode, 'fast'))
for (const path of [
  'apps/web/src/app/(app)/dashboard/_overview-access.ts',
  'apps/web/src/app/(app)/dashboard/page.tsx',
  'apps/web/src/app/(app)/dashboard/_property-overview.tsx',
  'apps/web/src/components/button.tsx',
  'apps/web/public/untrusted.svg',
  'apps/web/public/untrusted.js',
]) {
  test(`source or unknown path requires controlled: ${path}`, () =>
    assert.equal(plan(base, sha, `M\0${path}\0`, true).mode, 'controlled'))
}
test('live FAST activation stays disabled without atomic persistence and document-save safety', () => {
  assert.throws(() => assertLiveFastSafety(), /FAST_ACTIVATION_SAFETY_UNAVAILABLE/)
})
test('CONTROLLED wrapper cannot guess a competing workflow run', () => {
  const script = fileURLToPath(new URL('./controlled.mjs', import.meta.url))
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, SOURCE: sha, EXECUTE: 'true', PATH: '' },
      encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /CONTROLLED_DIRECT_WORKFLOW_REQUIRED/)
  }
})
test('the candidate digest must match the exact successful build job record', () => {
  const log = [
    `time echo "IMAGE TAG=${TARGET.image}:v1.4-dev-${sha}"`,
    `time echo "IMAGE DIGEST=${digest}"`,
    `time echo "Immutable DEV candidate: ${TARGET.image}@${digest}"`,
  ].join('\n')
  assert.doesNotThrow(() => assertBuildProvenance(log, sha, digest))
  assert.throws(
    () => assertBuildProvenance(log, sha, 'sha256:' + 'd'.repeat(64)),
    /IMAGE_BUILD_PROVENANCE_MISMATCH/,
  )
  assert.throws(
    () => assertBuildProvenance('fake labels only', sha, digest),
    /IMAGE_BUILD_PROVENANCE_MISMATCH/,
  )
  assert.throws(
    () => assertBuildProvenance(log + '\n' + log, sha, digest),
    /IMAGE_BUILD_PROVENANCE_MISMATCH/,
  )
})
const isolationMarkers = [
  'DEV-ISOLATION-SENTINEL-' + 'a'.repeat(32),
  'DEV-ISOLATION-SENTINEL-' + 'b'.repeat(32),
]
function isolationPage({ found = false, hiddenLeak = false, searches = [] } = {}) {
  return {
    setCookie: async () => {},
    goto: async (url) => {
      searches.push(url)
      const marker = isolationMarkers.find((value) => url.includes(value.slice(-16)))
      return {
        ok: () => true,
        headers: () => ({}),
        text: async () =>
          (found || hiddenLeak) && marker ? `<script>${marker}</script>` : '<html></html>',
      }
    },
    evaluate: async () => ({ history: true, visible: found, dom: found }),
  }
}
test('forged property checks require a positive control and reject visible or serialized leaks', async () => {
  const cases = [{ tenant: 'tenant', property: 'forbidden', marker: isolationMarkers[0] }]
  await assert.rejects(
    () => checkPropertyIsolation(isolationPage(), isolationPage(), TARGET.origin, cases, 'allowed'),
    /ISOLATION_POSITIVE_CONTROL_FAILED/,
  )
  await assert.rejects(
    () =>
      checkPropertyIsolation(
        isolationPage({ found: true }),
        isolationPage({ found: true }),
        TARGET.origin,
        cases,
        'allowed',
      ),
    /FORGED_PROPERTY_ISOLATION_FAILED/,
  )
  await assert.rejects(
    () =>
      checkPropertyIsolation(
        isolationPage({ hiddenLeak: true }),
        isolationPage({ found: true }),
        TARGET.origin,
        cases,
        'allowed',
      ),
    /FORGED_PROPERTY_ISOLATION_FAILED/,
  )
})
test('serialized sentinels cannot hide in escaped or split payloads', () => {
  const marker = isolationMarkers[0]
  const escaped = marker.replaceAll('-', String.raw`\u002d`)
  const twice = JSON.stringify({ note: escaped })
  const split = marker.slice(0, 12) + '\",\"' + marker.slice(12)
  assert.equal(payloadContainsSentinel(escaped, marker), true)
  assert.equal(payloadContainsSentinel(twice, marker), true)
  assert.equal(payloadContainsSentinel(marker.replaceAll('-', '&#45;'), marker), true)
  assert.equal(payloadContainsSentinel(marker.replaceAll('-', String.raw`\x2d`), marker), true)
  assert.equal(payloadContainsSentinel(marker.replaceAll('-', String.raw`\u{2d}`), marker), true)
  assert.equal(payloadContainsSentinel(marker.replaceAll('-', String.raw`\055`), marker), true)
  assert.equal(payloadContainsSentinel(marker.replaceAll('-', '%2d'), marker), true)
  assert.equal(payloadContainsSentinel(split, marker), true)
  assert.equal(payloadContainsSentinel('query=' + marker.slice(-16), marker), false)
})
test('oversized or deeply encoded payloads fail closed', () => {
  const marker = isolationMarkers[0]
  let nested = marker.replace('-', '%2d')
  for (let i = 0; i < 9; i++) nested = nested.replaceAll('%', '%25')
  assert.throws(
    () => payloadContainsSentinel(nested, marker),
    /ISOLATION_PAYLOAD_ENCODING_UNRESOLVED/,
  )
  assert.throws(
    () => payloadContainsSentinel('x'.repeat(2 * 1024 * 1024 + 1), marker),
    /ISOLATION_PAYLOAD_TOO_LARGE/,
  )
})
test('oversized declared response is rejected before reading its body', async () => {
  let read = false
  const page = {
    setCookie: async () => {},
    goto: async () => ({
      ok: () => true,
      headers: () => ({ 'content-length': String(3 * 1024 * 1024) }),
      text: async () => {
        read = true
        return ''
      },
    }),
  }
  await assert.rejects(
    () =>
      checkPropertyIsolation(
        page,
        page,
        TARGET.origin,
        [{ tenant: 'tenant', property: 'forbidden', marker: isolationMarkers[0] }],
        'allowed',
      ),
    /ISOLATION_PAYLOAD_TOO_LARGE/,
  )
  assert.equal(read, false)
})
test('escaped forbidden sentinel in hidden payload fails isolation', async () => {
  const marker = isolationMarkers[0]
  const escaped = marker.replaceAll('-', String.raw`\u002d`)
  const negative = {
    setCookie: async () => {},
    goto: async () => ({
      ok: () => true,
      headers: () => ({}),
      text: async () => `<script>${escaped}</script>`,
    }),
    evaluate: async () => ({ history: true, visible: false, dom: false }),
  }
  await assert.rejects(
    () =>
      checkPropertyIsolation(
        negative,
        isolationPage({ found: true }),
        TARGET.origin,
        [{ tenant: 'tenant', property: 'forbidden', marker }],
        'allowed',
      ),
    /FORGED_PROPERTY_ISOLATION_FAILED/,
  )
})
test('both controls search by unique partial markers before pagination', async () => {
  const searches = []
  await checkPropertyIsolation(
    isolationPage({ searches }),
    isolationPage({ found: true, searches }),
    TARGET.origin,
    [
      { tenant: 'one', property: 'first', marker: isolationMarkers[0] },
      { tenant: 'two', property: 'second', marker: isolationMarkers[1] },
    ],
    'allowed',
  )
  for (const marker of isolationMarkers) {
    assert.equal(searches.filter((url) => url.includes(`q=${marker.slice(-16)}`)).length, 2)
    assert.equal(searches.filter((url) => url.includes(marker)).length, 0)
  }
})
test('fixture verifier rejects stale files and unsafe ownership', () => {
  const entries = Array.from({ length: 5 }, () => ({
    uid: 0,
    gid: 0,
    mode: 0o755,
    validType: true,
  }))
  const pin = 'a'.repeat(64)
  assert.doesNotThrow(() => assertVerifierIntegrity('reviewed', 'reviewed', entries, pin))
  assert.throws(
    () => assertVerifierIntegrity('reviewed', 'stale', entries, pin),
    /VERIFIER_SOURCE_MISMATCH/,
  )
  assert.throws(
    () =>
      assertVerifierIntegrity(
        'reviewed',
        'reviewed',
        [{ ...entries[0], uid: 1000 }, ...entries.slice(1)],
        pin,
      ),
    /VERIFIER_OWNERSHIP_INVALID/,
  )
  assert.throws(
    () =>
      assertVerifierIntegrity(
        'reviewed',
        'reviewed',
        [{ ...entries[0], mode: 0o777 }, ...entries.slice(1)],
        pin,
      ),
    /VERIFIER_OWNERSHIP_INVALID/,
  )
  assert.throws(
    () => assertVerifierIntegrity('reviewed', 'reviewed', entries, 'missing'),
    /VERIFIER_MANIFEST_PIN_INVALID/,
  )
})
test('identity verification requires session IDs and authoritative non-admin non-impersonating state', () => {
  const email = 'fixture@example.invalid'
  const valid = {
    user: { id: 'user-123', email },
    session: { id: 'session-123', userId: 'user-123' },
  }
  assert.doesNotThrow(() => assertAuthoritativeIdentity(valid, email, () => 'PASS'))
  assert.throws(
    () => assertAuthoritativeIdentity({ user: { id: 'user-123', email } }, email, () => 'PASS'),
    /IDENTITY_SESSION_METADATA_REQUIRED/,
  )
  assert.throws(
    () => assertAuthoritativeIdentity(valid, email, () => ''),
    /IDENTITY_DATABASE_CHECK_FAILED/,
  )
  assert.throws(
    () => assertAuthoritativeIdentity(valid, email, () => 'DENY'),
    /IDENTITY_DATABASE_CHECK_FAILED/,
  )
  assert.throws(
    () => assertAuthoritativeIdentity(valid, email, () => 'DENY'),
    /IDENTITY_DATABASE_CHECK_FAILED/,
  )
})
test('web recovery identity must derive from the saved APP_VERSION', () => {
  assert.doesNotThrow(() =>
    assertRecoverySourceBinding(
      'services:\n  web:\n    environment:\n      UVANOO_RECOVERY_SOURCE_SHA: ${APP_VERSION}\n  other:\n',
    ),
  )
  assert.throws(
    () =>
      assertRecoverySourceBinding(
        'services:\n  web:\n    environment:\n      UVANOO_RECOVERY_SOURCE_SHA: stale\n',
      ),
    /RECOVERY_SOURCE_BINDING_MISMATCH/,
  )
})
test('environment patch rejects duplicates and preserves secrets', () => {
  assert.equal(
    patchEnv('IMAGE=old\nSECRET=untouched\n', { IMAGE: 'new' }),
    'IMAGE=new\nSECRET=untouched\n',
  )
  assert.throws(() => patchEnv('IMAGE=x\nIMAGE=y', { IMAGE: 'z' }))
})
test('configuration persistence uses only the scoped environment endpoint', async () => {
  const previous = {
    sha: base,
    digest,
    env: `IMAGE=${TARGET.image}@${digest}\nAPP_VERSION=${base}\nSECRET=kept`,
    composeFile: 'unchanged',
  }
  const next = { ...previous, sha }
  let current = { env: previous.env, composeFile: previous.composeFile }
  const calls = []
  await persistConfiguration(
    {
      compose: async () => current,
      api: async (method, body) => {
        calls.push([method, body])
        current = { ...current, env: body.env }
      },
    },
    previous,
    next,
  )
  assert.equal(calls[0][0], 'saveEnvironment')
  assert.deepEqual(Object.keys(calls[0][1]).sort(), ['composeId', 'env'])
  assert.equal(calls[0][1].composeId, TARGET.composeId)
  assert.match(current.env, /SECRET=kept/)
  assert.match(current.env, new RegExp(`APP_VERSION=${sha}`))
})
test('configuration persistence rejects drift before any write', async () => {
  let writes = 0
  const from = {
    sha: base,
    digest,
    env: `IMAGE=${TARGET.image}@${digest}\nAPP_VERSION=${base}`,
    composeFile: 'expected',
  }
  await assert.rejects(
    () =>
      persistConfiguration(
        {
          compose: async () => ({ env: from.env, composeFile: 'changed' }),
          api: async () => {
            writes++
          },
        },
        from,
        { ...from, sha },
      ),
    /CONFIG_DRIFT_DO_NOT_OVERWRITE/,
  )
  assert.equal(writes, 0)
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
for (const gate of [
  'verifyCI',
  'verifyImage',
  'preflight',
  'verifyActivationSafety',
  'smoke',
  'assertUnchanged',
]) {
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

test('Handover save completes without a navigation event', async () => {
  const { submitHandover } = await import('./submit.mjs')
  let submitted = false,
    completed = false
  const response = {
    url: () => TARGET.origin + '/hospitality/handover',
    request: () => ({ method: () => 'POST' }),
    ok: () => true,
    buffer: async () => {
      completed = true
    },
  }
  await submitHandover({
    waitForResponse: async (matches) => {
      assert(matches(response))
      assert(!matches({ ...response, url: () => 'https://example.com/hospitality/handover' }))
      assert(!matches({ ...response, request: () => ({ method: () => 'GET' }) }))
      return response
    },
    $eval: async () => {
      submitted = true
    },
  })
  assert(submitted && completed)
})

test('failed Handover POST cannot pass the smoke test', async () => {
  const { submitHandover } = await import('./submit.mjs')
  await assert.rejects(
    submitHandover({
      waitForResponse: async () => ({ ok: () => false }),
      $eval: async () => {},
    }),
    /HANDOVER_SUBMISSION_FAILED/,
  )
})

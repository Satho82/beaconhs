import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  counts,
  controls,
  replicas,
  runFence,
  runtimeReady,
  writers,
  zero,
} from './dev-writer-fence.mjs'

const stack = 'uvanoo-v1-4-dev-gniriv'
const sha = 'a'.repeat(40),
  digest = `sha256:${'b'.repeat(64)}`
const image = `ghcr.io/satho82/uvanoo-staging-private@${digest}`
const config = {
  verified: 'true',
  mode: 'api',
  stack,
  composeId: 'wYb0LxLQrvj2FPI21i-Oj',
  host: 'dev.uvanoo.com',
  sha,
  digest,
}
const envFor = (n) =>
  writers.map((r) => `${controls[r]}=${n[r]}`).join('\n') + '\nSECRET=never-display\n'
function snapshot(n, generation = 0) {
  const services = writers.map((r) => ({
    ID: r,
    Spec: {
      Name: `${stack}_${r}`,
      Mode: { Replicated: { Replicas: n[r] } },
      TaskTemplate: { ContainerSpec: { Image: image, Env: [`APP_VERSION=${sha}`] } },
    },
  }))
  const tasks = services
    .filter((s) => n[s.ID])
    .map((s) => ({
      ID: `${s.ID}-${generation}`,
      ServiceID: s.ID,
      Spec: s.Spec.TaskTemplate,
      DesiredState: 'running',
      health: 'healthy',
      Status: {
        State: s.ID === 'scheduler' ? 'complete' : 'running',
        ContainerStatus: { ExitCode: 0 },
      },
    }))
  return { services, tasks }
}
function fixture() {
  let state = {
    composeId: config.composeId,
    appName: stack,
    environmentId: 'qT391QtcIqahNap5wPjif',
    serverId: null,
    sourceType: 'raw',
    composeType: 'stack',
    autoDeploy: false,
    composeFile: 'unchanged compose',
    env: envFor(zero),
    domains: [
      {
        composeId: config.composeId,
        host: 'dev.uvanoo.com',
        serviceName: 'web',
        port: 3000,
        https: true,
        enabled: true,
        path: '/',
      },
    ],
  }
  let runtime = snapshot(zero),
    generation = 0
  const events = []
  const io = {
    get: async () => structuredClone(state),
    update: async (p) => {
      events.push('persist')
      state = { ...state, env: p.env }
    },
    validateCompose: async () => events.push('validate'),
    deploy: async () => {
      events.push('deploy')
      runtime = snapshot(counts(state.env), ++generation)
    },
    runtime: async () => {
      events.push('runtime')
      return structuredClone(runtime)
    },
    sleep: async () => {},
  }
  return {
    io,
    events,
    state: () => state,
    setState: (s) => {
      state = { ...state, ...s }
    },
    setRuntime: (r) => {
      runtime = r
    },
  }
}
const admit = (f, r) => runFence(`restore-${r}`, f.io, { ...config, authorization: `restore-${r}` })
test('all FIVE services fence and require two actual zero observations', async () => {
  const f = fixture()
  await runFence('fence', f.io, config)
  assert.deepEqual(f.events, ['validate', 'persist', 'deploy', 'runtime', 'runtime'])
  await runFence('verify-zero', f.io, config)
  assert.deepEqual(counts(f.state().env), zero)
})
test('independent sequential approvals never enable storage-init', async () => {
  const f = fixture()
  for (const role of ['web', 'worker', 'scheduler', 'collabora']) {
    await admit(f, role)
    assert.equal(counts(f.state().env)[role], 1)
    assert.equal(counts(f.state().env)['storage-init'], 0)
    if (role === 'web') assert.deepEqual(counts(f.state().env), { ...zero, web: 1 })
  }
  assert.match(f.state().env, /SECRET=never-display/)
})
for (const role of ['worker', 'scheduler', 'collabora'])
  test(`${role} cannot bypass web-first`, async () => {
    const f = fixture()
    await assert.rejects(admit(f, role), /WEB_FIRST_REQUIRED/)
    assert.deepEqual(f.events, [])
  })
test('scheduler requires prior worker approval', async () => {
  const f = fixture()
  await admit(f, 'web')
  await assert.rejects(admit(f, 'scheduler'), /WORKER_FIRST_REQUIRED/)
})
for (const mode of ['restore', 'restore-storage-init', 'unknown'])
  test(`${mode} has no admission path`, async () => {
    const f = fixture()
    await assert.rejects(runFence(mode, f.io, config), /FENCE_MODE_INVALID/)
    assert.deepEqual(f.events, [])
  })
test('activation requires matching explicit authorization', async () => {
  const f = fixture()
  await assert.rejects(
    runFence('restore-web', f.io, config),
    /SERVICE_OWNER_AUTHORIZATION_REQUIRED/,
  )
  assert.deepEqual(f.events, [])
})
for (const method of ['get', 'validateCompose', 'update', 'deploy', 'runtime'])
  test(`${method} failure propagates without recovery`, async () => {
    const f = fixture()
    f.io[method] = async () => {
      throw new Error('fixture failure')
    }
    await assert.rejects(runFence('fence', f.io, config), /fixture failure/)
    assert.equal(counts(f.state().env).web, 0)
  })
test('HTTP acknowledgement without saved fence fails', async () => {
  const f = fixture()
  f.setState({ env: envFor({ ...zero, web: 1 }) })
  f.io.update = async () => {}
  await assert.rejects(runFence('fence', f.io, config), /FENCE_PERSIST_POSTCONDITION/)
  assert.ok(!f.events.includes('deploy'))
})
for (const role of writers)
  test(`shutdown-desired active ${role} blocks capture/migration`, async () => {
    const f = fixture(),
      r = snapshot(zero)
    r.tasks.push({
      ID: 'old',
      ServiceID: role,
      DesiredState: 'shutdown',
      Status: { State: 'running' },
    })
    f.setRuntime(r)
    await assert.rejects(runFence('verify-zero', f.io, config), /WRITER_CONVERGENCE_TIMEOUT/)
  })
test('control-plane drift fails closed', async () => {
  const f = fixture(),
    deploy = f.io.deploy
  f.io.deploy = async () => {
    await deploy()
    f.setState({ composeFile: 'drift' })
  }
  await assert.rejects(runFence('fence', f.io, config), /CONTROL_PLANE_DRIFT/)
})
test('stale candidate and unhealthy web cannot pass', async () => {
  const f = fixture(),
    r = snapshot(zero)
  r.services[0].Spec.TaskTemplate.ContainerSpec.Image = 'stale'
  f.setRuntime(r)
  await assert.rejects(admit(f, 'web'), /WRITER_CONVERGENCE_TIMEOUT/)
  assert.ok(!f.events.includes('persist'))
  const n = { ...zero, web: 1 },
    bad = snapshot(n)
  bad.tasks[0].health = 'unhealthy'
  assert.equal(runtimeReady(bad.services, bad.tasks, n, image, sha, true), false)
})
test('scheduler requires fresh successful completion', () => {
  const n = { ...zero, web: 1, worker: 1, scheduler: 1 },
    r = snapshot(n)
  assert.equal(runtimeReady(r.services, r.tasks, n, image, sha, true), true)
  assert.equal(
    runtimeReady(r.services, r.tasks, n, image, sha, true, new Set(['scheduler-0'])),
    false,
  )
  r.tasks.find((t) => t.ServiceID === 'scheduler').Status.ContainerStatus.ExitCode = 1
  assert.equal(runtimeReady(r.services, r.tasks, n, image, sha, true), false)
})
test('unknown tasks and malformed service state fail closed', () => {
  const r = snapshot(zero)
  r.tasks = [{ ServiceID: 'web', Status: { State: 'unknown' } }]
  assert.equal(runtimeReady(r.services, r.tasks, zero), false)
  delete r.services[0].Spec.Mode
  assert.throws(() => runtimeReady(r.services, r.tasks, zero), /WRITER_MODE_AMBIGUOUS/)
})
for (const change of [
  { verified: 'false' },
  { mode: 'direct' },
  { stack: 'staging' },
  { host: 'portal.uvanoo.com' },
  { composeId: 'other' },
])
  test(`wrong context ${JSON.stringify(change)}`, async () => {
    const f = fixture()
    await assert.rejects(runFence('fence', f.io, { ...config, ...change }), /DEV_CONTEXT_REQUIRED/)
    assert.deepEqual(f.events, [])
  })
test('wrong target and legacy control require approved bootstrap', async () => {
  const f = fixture()
  f.setState({ appName: 'legacy' })
  await assert.rejects(runFence('fence', f.io, config), /DEV_TARGET_MISMATCH/)
  f.setState({ appName: stack, env: 'WRITER_REPLICAS=0' })
  await assert.rejects(runFence('fence', f.io, config), /LEGACY_FENCE_REQUIRES_APPROVED_BOOTSTRAP/)
  assert.deepEqual(f.events, [])
})
test('ambiguous controls and invalid target counts rejected; unrelated bytes preserved', () => {
  const good = envFor(zero)
  for (const bad of [
    '',
    good.replace('WEB_REPLICAS=0', 'WEB_REPLICAS=2'),
    good + 'WEB_REPLICAS=1',
    good.replace('WEB_REPLICAS=0', 'export WEB_REPLICAS=0'),
  ])
    assert.throws(() => counts(bad), /FENCE_ENV_AMBIGUOUS/)
  assert.throws(() => replicas(good, { ...zero, worker: 2 }), /FENCE_VALUE_INVALID/)
  assert.equal(replicas(good, zero), good)
})

test('failed activation compensates with a persisted, verified full fence', async () => {
  const f = fixture(),
    deploy = f.io.deploy
  let attempts = 0
  f.io.deploy = async () => {
    if (++attempts === 1) throw new Error('lost acknowledgement')
    await deploy()
  }
  await assert.rejects(admit(f, 'web'), /ADMISSION_FAILED_REFENCED/)
  assert.deepEqual(counts(f.state().env), zero)
  assert.equal(attempts, 2)
})
test('failed compensation explicitly reports uncertain runtime, never success', async () => {
  const f = fixture()
  f.io.deploy = async () => {
    throw new Error('unavailable')
  }
  await assert.rejects(admit(f, 'web'), /ADMISSION_FAILED_FENCE_UNCONFIRMED/)
  assert.deepEqual(counts(f.state().env), zero)
})
test('saved candidate validation fails before any activation write', async () => {
  const f = fixture()
  f.io.validateCompose = async (_state, expectedImage, expectedSha) => {
    assert.equal(expectedImage, image)
    assert.equal(expectedSha, sha)
    throw new Error('SAVED_CANDIDATE_IDENTITY_MISMATCH')
  }
  await assert.rejects(admit(f, 'web'), /SAVED_CANDIDATE_IDENTITY_MISMATCH/)
  assert.ok(!f.events.includes('persist'))
})

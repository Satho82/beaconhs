import assert from 'node:assert/strict'
import { test } from 'node:test'
import { replicas, runFence, runtimeReady, writers } from './dev-writer-fence.mjs'

const stack = 'uvanoo-v1-4-dev-gniriv'
const sha = 'a'.repeat(40)
const digest = `sha256:${'b'.repeat(64)}`
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
function snapshot(count, candidate = false, restored = false) {
  const spec = { Image: candidate ? image : 'previous@sha256:old', Env: [`APP_VERSION=${sha}`] }
  const services = writers.map((role) => ({
    ID: role,
    Spec: {
      Name: `${stack}_${role}`,
      Mode: { Replicated: { Replicas: count } },
      TaskTemplate: { ContainerSpec: spec },
    },
  }))
  const tasks = count
    ? writers.map((role) => ({
        ID: `task-${role}`,
        ServiceID: role,
        Spec: { ContainerSpec: spec },
        DesiredState: 'running',
        health: 'healthy',
        Status: {
          State: role === 'scheduler' && restored ? 'complete' : 'running',
          ContainerStatus: { ExitCode: 0 },
        },
      }))
    : []
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
    env: 'IMAGE=previous\nWRITER_REPLICAS=1\nSECRET=never-display\n',
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
  let runtime = snapshot(1)
  const events = []
  const io = {
    get: async () => structuredClone(state),
    update: async (payload) => {
      events.push(`persist-${/WRITER_REPLICAS=(\d)/.exec(payload.env)[1]}`)
      state = { ...state, env: payload.env }
    },
    validateCompose: async () => events.push('validate-compose'),
    deploy: async () => {
      events.push('rollout')
      const count = /WRITER_REPLICAS=1/.test(state.env) ? 1 : 0
      const candidate = runtime.services[0].Spec.TaskTemplate.ContainerSpec.Image === image
      runtime = snapshot(count, candidate, count === 1)
    },
    runtime: async () => {
      events.push('runtime-proof')
      return structuredClone(runtime)
    },
    sleep: async () => {},
  }
  return {
    io,
    events,
    setState: (next) => {
      state = { ...state, ...next }
    },
    setRuntime: (next) => {
      runtime = next
    },
    state: () => state,
  }
}

test('persist, rollout and actual zero-writer proof precede migration; candidate stays fenced until restore', async () => {
  const f = fixture()
  await runFence('fence', f.io, config)
  assert.deepEqual(f.events, [
    'validate-compose',
    'persist-0',
    'rollout',
    'runtime-proof',
    'runtime-proof',
  ])
  await runFence('verify-zero', f.io, config)
  f.events.push('migration-connectivity', 'migration-identity', 'migration')
  f.setRuntime(snapshot(0, true))
  f.events.push('candidate-rollout')
  await runFence('restore', f.io, config)
  assert.ok(f.events.indexOf('persist-1') > f.events.indexOf('candidate-rollout'))
  assert.match(f.state().env, /WRITER_REPLICAS=1/)
  assert.match(f.state().env, /SECRET=never-display/)
})

for (const failingMethod of ['get', 'validateCompose', 'update', 'deploy', 'runtime']) {
  test(`${failingMethod} failure prevents migration and automatic restore`, async () => {
    const f = fixture()
    f.io[failingMethod] = async () => {
      throw new Error('fixture failure')
    }
    await assert.rejects(async () => {
      await runFence('fence', f.io, config)
      f.events.push('migration')
    })
    assert.ok(!f.events.includes('migration') && !f.events.includes('persist-1'))
  })
}

test('HTTP acknowledgement without persisted fence fails closed', async () => {
  const f = fixture()
  f.io.update = async () => {}
  await assert.rejects(runFence('fence', f.io, config), /FENCE_PERSIST_POSTCONDITION/)
  assert.ok(!f.events.includes('rollout'))
})

test('saved fence with active shutdown-desired task never authorizes migration', async () => {
  const f = fixture()
  f.io.deploy = async () => {}
  const stale = snapshot(0)
  stale.tasks = [
    { ID: 'old', ServiceID: 'web', DesiredState: 'shutdown', Status: { State: 'running' } },
  ]
  f.setRuntime(stale)
  await assert.rejects(runFence('fence', f.io, config), /WRITER_CONVERGENCE_TIMEOUT/)
})

test('unknown task states block zero proof; malformed service state fails', () => {
  const r = snapshot(0)
  r.tasks = [{ ServiceID: 'web', Status: { State: 'unknown' } }]
  assert.equal(runtimeReady(r.services, r.tasks, 0), false)
  delete r.services[0].Spec.Mode
  assert.throws(() => runtimeReady(r.services, r.tasks, 0), /WRITER_MODE_AMBIGUOUS/)
})

test('control-plane drift after fence prevents migration', async () => {
  const f = fixture(),
    deploy = f.io.deploy
  f.io.deploy = async () => {
    await deploy()
    f.setState({ composeFile: 'concurrent change' })
  }
  await assert.rejects(runFence('fence', f.io, config), /CONTROL_PLANE_DRIFT/)
})

test('migration failure leaves persisted zero and never runs candidate/restore', async () => {
  const f = fixture()
  await assert.rejects(async () => {
    await runFence('fence', f.io, config)
    await runFence('verify-zero', f.io, config)
    throw new Error('migration failed')
  }, /migration failed/)
  assert.match(f.state().env, /WRITER_REPLICAS=0/)
  assert.ok(!f.events.includes('persist-1'))
})

test('restore refuses old candidate specs and keeps zero replicas', async () => {
  const f = fixture()
  await runFence('fence', f.io, config)
  await assert.rejects(runFence('restore', f.io, config), /WRITER_CONVERGENCE_TIMEOUT/)
  assert.ok(!f.events.includes('persist-1'))
})

test('restore refuses a saved Compose that would revive another image', async () => {
  const f = fixture()
  await runFence('fence', f.io, config)
  f.setRuntime(snapshot(0, true))
  f.io.validateCompose = async (_state, expectedImage, expectedSha) => {
    assert.equal(expectedImage, image)
    assert.equal(expectedSha, sha)
    throw new Error('SAVED_CANDIDATE_IDENTITY_MISMATCH')
  }
  await assert.rejects(runFence('restore', f.io, config), /SAVED_CANDIDATE_IDENTITY_MISMATCH/)
  assert.ok(!f.events.includes('persist-1'))
})

test('restore requires healthy exact-image writers and a fresh successful scheduler', () => {
  const r = snapshot(1, true, true)
  assert.equal(runtimeReady(r.services, r.tasks, 1, image, sha, true), true)
  assert.equal(
    runtimeReady(r.services, r.tasks, 1, image, sha, true, new Set(['task-scheduler'])),
    false,
  )
  r.tasks[0].health = 'unhealthy'
  assert.equal(runtimeReady(r.services, r.tasks, 1, image, sha, true), false)
  r.tasks[0].health = 'healthy'
  r.tasks[2].Status.ContainerStatus.ExitCode = 1
  assert.equal(runtimeReady(r.services, r.tasks, 1, image, sha, true), false)
})

for (const change of [
  { verified: 'false' },
  { mode: 'direct' },
  { stack: 'staging' },
  { host: 'portal.uvanoo.com' },
  { composeId: 'production' },
]) {
  test(`non-DEV context rejected: ${JSON.stringify(change)}`, async () => {
    const f = fixture()
    await assert.rejects(runFence('fence', f.io, { ...config, ...change }), /DEV_CONTEXT_REQUIRED/)
    assert.deepEqual(f.events, [])
  })
}

test('wrong Dokploy target rejected before writes', async () => {
  const f = fixture()
  f.setState({ appName: 'production' })
  await assert.rejects(runFence('fence', f.io, config), /DEV_TARGET_MISMATCH/)
  assert.deepEqual(f.events, [])
})

test('ambiguous, missing and duplicate fence values fail closed', () => {
  for (const value of [
    '',
    'WRITER_REPLICAS=2',
    'WRITER_REPLICAS=1\nWRITER_REPLICAS=0',
    'export WRITER_REPLICAS=1',
  ]) {
    assert.throws(() => replicas(value, 0), /FENCE_ENV_AMBIGUOUS/)
  }
})

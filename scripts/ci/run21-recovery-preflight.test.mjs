import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSnapshot, sha, digest } from './run21-recovery-preflight.mjs'

const image = `ghcr.io/satho82/uvanoo-staging-private@${digest}`
function fixture(phase) {
  const roles = ['web', 'worker', 'scheduler']
  return {
    revision: sha,
    version: `v1.4-dev-${sha}`,
    legacyRunning: false,
    allowedAddresses: ['10.0.4.45'],
    db: { open: 0, prepared: 0, sessions: [] },
    services: roles.map((role) => ({
      ID: role,
      Spec: {
        Name: `uvanoo-v1-4-dev-gniriv_${role}`,
        Mode: {
          Replicated: {
            Replicas: phase === 'zero' || (phase === 'before' && role === 'web') ? 0 : 1,
          },
        },
        TaskTemplate: { ContainerSpec: { Image: image, Env: [`APP_VERSION=${sha}`] } },
      },
    })),
    tasks: roles
      .filter((role) => phase !== 'zero' && !(phase === 'before' && role === 'web'))
      .map((role) => ({
        ServiceID: role,
        Status: {
          State: role === 'scheduler' ? 'complete' : 'running',
          ContainerStatus: { ExitCode: 0 },
        },
        DesiredState: 'running',
        health: 'healthy',
        Spec: { ContainerSpec: { Image: image, Env: [`APP_VERSION=${sha}`] } },
      })),
  }
}
for (const phase of ['before', 'zero', 'after']) {
  test(`${phase} accepts only the expected governed state`, () =>
    validateSnapshot(fixture(phase), phase))
  for (const [name, mutate] of [
    [
      'legacy writer',
      (s) => {
        s.legacyRunning = true
      },
    ],
    [
      'wrong OCI identity',
      (s) => {
        s.revision = 'wrong'
      },
    ],
    [
      'wrong service image',
      (s) => {
        s.services[0].Spec.TaskTemplate.ContainerSpec.Image = 'wrong'
      },
    ],
    [
      'prepared transaction',
      (s) => {
        s.db.prepared = 1
      },
    ],
    [
      'unexpected client',
      (s) => {
        s.db.sessions.push({ usename: 'beaconhs_app', client_addr: '10.0.4.99' })
      },
    ],
    [
      'unexpected DB role',
      (s) => {
        s.db.sessions.push({ usename: 'postgres', client_addr: '10.0.4.45' })
      },
    ],
    [
      'paused update',
      (s) => {
        s.services[0].UpdateStatus = { State: 'paused' }
      },
    ],
  ])
    test(`${phase} rejects ${name}`, () => {
      const s = fixture(phase)
      mutate(s)
      assert.throws(() => validateSnapshot(s, phase))
    })
}
for (const phase of ['before', 'zero'])
  test(`${phase} rejects open transactions`, () => {
    const s = fixture(phase)
    s.db.open = 1
    assert.throws(() => validateSnapshot(s, phase))
  })
test('zero rejects even a known database client', () => {
  const s = fixture('zero')
  s.db.sessions.push({ usename: 'beaconhs_app', client_addr: '10.0.4.45' })
  assert.throws(() => validateSnapshot(s, 'zero'))
})
test('zero rejects actual running tasks with desired shutdown', () => {
  const s = fixture('zero')
  s.tasks.push({ ServiceID: 'web', DesiredState: 'shutdown', Status: { State: 'running' } })
  assert.throws(() => validateSnapshot(s, 'zero'))
})
for (const role of ['web', 'worker'])
  test(`after rejects unhealthy ${role}`, () => {
    const s = fixture('after')
    s.tasks.find((x) => x.ServiceID === role).health = 'unhealthy'
    assert.throws(() => validateSnapshot(s, 'after'))
  })
test('after rejects failed scheduler', () => {
  const s = fixture('after')
  s.tasks.find((x) => x.ServiceID === 'scheduler').Status.ContainerStatus.ExitCode = 1
  assert.throws(() => validateSnapshot(s, 'after'))
})
test('before rejects already-restored web to prevent repeat recovery', () => {
  const s = fixture('after')
  assert.throws(() => validateSnapshot(s, 'before'))
})

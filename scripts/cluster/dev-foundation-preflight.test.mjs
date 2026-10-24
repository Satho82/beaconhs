import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  configurationComparison,
  runtimeComparison,
  storageContract,
} from './dev-foundation-preflight.mjs'
import { controls, liveIO, writers, zero } from './dev-writer-fence.mjs'

// Synthetic credentials only. No daemon, network, repository secrets or live files.
const permanent = {
  DATABASE_URL: 'postgres://beaconhs_app:synthetic@uvanoo-dev-postgres:5432/uvanoo_dev',
  SUPERADMIN_DATABASE_URL: 'postgres://beaconhs_super:synthetic@uvanoo-dev-postgres:5432/uvanoo_dev',
  REDIS_URL: 'redis://:synthetic@uvanoo-dev-redis:6379/0',
  R2_ENDPOINT: 'http://uvanoo-dev-minio:9000',
  R2_BUCKET: 'synthetic-dev-bucket',
  R2_ACCESS_KEY_ID: 'synthetic-key',
  R2_SECRET_ACCESS_KEY: 'synthetic-secret',
}
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  ...permanent,
  MINIO_ROOT_USER: 'synthetic-admin',
  MINIO_ROOT_PASSWORD: 'synthetic-admin-secret',
  IMAGE: `ghcr.io/satho82/uvanoo-staging-private@sha256:${'a'.repeat(64)}`,
  COLLABORA_IMAGE: `collabora/code@sha256:${'b'.repeat(64)}`,
  APP_VERSION: 'c'.repeat(40),
  APP_URL: 'https://dev.uvanoo.com',
  RUNTIME_DB_NETWORK: 'uvanoo-dev-runtime',
  WRITER_REPLICAS: '1',
  BETTER_AUTH_SECRET: 'synthetic',
  ATTACHMENT_CAPABILITY_SECRET: 'synthetic',
  SENTRY_DSN: '',
  R2_PRIVATE_BUCKET_CONFIRMED: 'true',
  VAPID_PUBLIC_KEY: '',
  VAPID_PRIVATE_KEY: '',
  VAPID_SUBJECT: '',
  COLLABORA_URL: 'https://dev.uvanoo.com',
  COLLABORA_WOPI_URL: 'https://dev.uvanoo.com',
  COLLABORA_SERVER_NAME: 'dev.uvanoo.com',
}
function render(file, extra = {}) {
  return JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '--project-name',
        'uvanoo-foundation-contract',
        '-f',
        `deploy/${file}`,
        'config',
        '--format',
        'json',
      ],
      { env: { ...env, ...extra }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  )
}
const after = render('dokploy-uvanoo-foundation.compose.yaml')
const composeFile = readFileSync('deploy/dokploy-uvanoo-foundation.compose.yaml', 'utf8')
const syntheticEnv = Object.entries({
  ...env,
  ...Object.fromEntries(writers.map((role) => [controls[role], '0'])),
})
  .filter(([name]) => !['HOME', 'PATH', 'WRITER_REPLICAS'].includes(name))
  .map(([name, value]) => `${name}=${value}`)
  .join('\n')
test('actual helper renderer validates independent controls without daemon or API calls', () => {
  liveIO().validateCompose({ composeFile, env: syntheticEnv }, env.IMAGE, env.APP_VERSION)
})
for (const [name, source, vars] of [
  [
    'coupled service controls',
    composeFile.replace('${WORKER_REPLICAS:-0}', '${WEB_REPLICAS:-0}'),
    syntheticEnv,
  ],
  [
    'replica interpolation changes environment',
    composeFile.replace('APP_ROLE: web', 'APP_ROLE: ${WEB_REPLICAS:-0}'),
    syntheticEnv,
  ],
  ['unpinned image', composeFile, syntheticEnv.replace(env.IMAGE, 'application:latest')],
])
  test(`actual helper renderer rejects ${name}`, () => {
    assert.throws(() => liveIO().validateCompose({ composeFile: source, env: vars }))
  })
const before = render('dokploy-dev.compose.yaml')
for (const role of ['web', 'worker', 'scheduler']) {
  for (const name of ['DATABASE_URL', 'SUPERADMIN_DATABASE_URL', 'REDIS_URL']) {
    if (before.services[role].environment[name])
      before.services[role].environment[name] = before.services[role].environment[name].replace(
        'synthetic@uvanoo-dev-',
        'old-synthetic@obsolete-',
      )
  }
}
test('rendered default retains five services, pinned images and ALL admission disabled', () => {
  assert.deepEqual(Object.keys(after.services).sort(), [...writers].sort())
  for (const role of writers) assert.equal(after.services[role].deploy.replicas, 0)
})
test('all 32 independent rendered combinations alter replicas ONLY', () => {
  for (let mask = 0; mask < 32; mask++) {
    const values = Object.fromEntries(writers.map((r, i) => [controls[r], String((mask >> i) & 1)]))
    const actual = render('dokploy-uvanoo-foundation.compose.yaml', values)
    for (const role of writers) {
      assert.equal(actual.services[role].deploy.replicas, Number(values[controls[role]]))
      actual.services[role].deploy.replicas = zero[role]
    }
    assert.deepEqual(actual, after)
  }
})
test('sanitized correction allows only approved identity fields and zero fencing', () => {
  const report = configurationComparison(before, after, permanent)
  assert.equal(report.status, 'PASS')
  const text = JSON.stringify(report)
  for (const forbidden of ['synthetic', 'postgres:', 'redis:', '@', 'beaconhs_app'])
    assert.ok(!text.includes(forbidden))
})
for (const [name, mutate] of [
  [
    'password mismatch',
    (c) => {
      c.services.web.environment.DATABASE_URL = permanent.DATABASE_URL.replace('synthetic', 'wrong')
    },
  ],
  [
    'wrong database',
    (c) => {
      c.services.worker.environment.DATABASE_URL = permanent.DATABASE_URL.replace(
        '/uvanoo_dev',
        '/uvanoo_dev',
      )
    },
  ],
  [
    'admin role on app connection',
    (c) => {
      c.services.web.environment.DATABASE_URL = permanent.SUPERADMIN_DATABASE_URL
    },
  ],
  [
    'wrong redis db',
    (c) => {
      c.services.scheduler.environment.REDIS_URL = permanent.REDIS_URL.replace('/0', '/1')
    },
  ],
  [
    'query override',
    (c) => {
      c.services.web.environment.DATABASE_URL += '?host=legacy'
    },
  ],
  [
    'options removed',
    (c) => {
      c.services.web.environment.DATABASE_URL += '?sslmode=require'
    },
  ],
  [
    'storage key mismatch',
    (c) => {
      c.services['storage-init'].environment.R2_SECRET_ACCESS_KEY = 'wrong'
    },
  ],
  [
    'bucket changed',
    (c) => {
      c.services.web.environment.R2_BUCKET = 'legacy'
    },
  ],
  [
    'healthcheck changed',
    (c) => {
      c.services.web.healthcheck.disable = true
    },
  ],
  [
    'network changed',
    (c) => {
      c.services.web.networks = {}
    },
  ],
  [
    'unpinned image',
    (c) => {
      c.services.collabora.image = 'collabora/code:latest'
    },
  ],
  [
    'missing service prune hazard',
    (c) => {
      delete c.services.collabora
    },
  ],
  [
    'background enabled',
    (c) => {
      c.services.worker.deploy.replicas = 1
    },
  ],
  [
    'scheduler admin privilege added',
    (c) => {
      c.services.scheduler.environment.SUPERADMIN_DATABASE_URL = permanent.SUPERADMIN_DATABASE_URL
    },
  ],
])
  test(`reject ${name}`, () => {
    const next = structuredClone(after)
    mutate(next)
    assert.throws(() => configurationComparison(before, next, permanent))
  })
const minio = render('uvanoo-dev-minio-recovery.compose.yaml')
const storage = () => ({
  volume: {
    Name: 'uvanoo-dev-minio-data',
    Driver: 'local',
    Mountpoint: '/synthetic/dev/data',
    Options: null,
  },
  legacyMounts: [{ Source: '/synthetic/legacy/data' }],
  existingMounts: [],
  compose: structuredClone(minio),
})
test('external retained volume contract never certifies completeness or authorizes start', () => {
  const result = storageContract(storage())
  assert.equal(result.status, 'PASS')
  assert.equal(result.objectCompleteness, 'UNKNOWN')
  assert.equal(result.executionAuthorized, false)
})
test('MinIO mount copy and startup-command drift are rejected', () => {
  const copying = storage()
  copying.compose.services.minio.volumes[0].volume.nocopy = false
  assert.throws(() => storageContract(copying), /MINIO_MOUNT_INVALID/)
  const command = storage()
  command.compose.services.minio.command = ['other']
  assert.throws(() => storageContract(command), /MINIO_STARTUP_DRIFT/)
})
for (const [name, mutate] of [
  [
    'absent volume',
    (s) => {
      delete s.volume
    },
  ],
  [
    'wrong volume',
    (s) => {
      s.volume.Name = 'new-empty-volume'
    },
  ],
  [
    'legacy overlap',
    (s) => {
      s.legacyMounts[0].Source = '/synthetic/dev'
    },
  ],
  [
    'existing consumer',
    (s) => {
      s.existingMounts.push({})
    },
  ],
  [
    'automatic creation',
    (s) => {
      s.compose.volumes['uvanoo-dev-minio-data'].external = false
    },
  ],
  [
    'port exposure',
    (s) => {
      s.compose.services.minio.ports = [{ target: 9000, published: '9000' }]
    },
  ],
  [
    'wrong mount',
    (s) => {
      s.compose.services.minio.volumes[0].source = 'legacy'
    },
  ],
  [
    'network creation',
    (s) => {
      s.compose.networks['uvanoo-dev-runtime'].external = false
    },
  ],
  [
    'unknown driver mapping',
    (s) => {
      s.volume.Options = { device: '/legacy' }
    },
  ],
])
  test(`storage rejects ${name}`, () => {
    const data = storage()
    mutate(data)
    assert.throws(() => storageContract(data))
  })
test('CLI emits symbolic errors only even with malformed secret-bearing input', () => {
  for (const input of [
    'synthetic-password invalid json',
    JSON.stringify({ before, after: { services: {} }, permanent }),
  ]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/cluster/dev-foundation-preflight.mjs', 'configuration'],
      { input, encoding: 'utf8' },
    )
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.match(result.stderr.trim(), /^[A-Z_]+$/)
  }
})

function runtime() {
  return writers.map((role) => ({
    Spec: {
      Name: `uvanoo-v1-4-dev-gniriv_${role}`,
      Mode: { Replicated: { Replicas: after.services[role].deploy.replicas } },
      TaskTemplate: {
        ContainerSpec: {
          Image: after.services[role].image,
          Env: Object.entries(after.services[role].environment).map(
            ([name, value]) => `${name}=${value}`,
          ),
        },
      },
    },
  }))
}
test('private runtime environment comparison includes credentials without reporting them', () => {
  const result = runtimeComparison(after, runtime())
  assert.equal(result.status, 'PASS')
  assert.ok(!JSON.stringify(result).includes('synthetic'))
})
for (const [name, mutate] of [
  [
    'credential mismatch',
    (s) => {
      s[0].Spec.TaskTemplate.ContainerSpec.Env.push('UNAPPROVED=synthetic')
    },
  ],
  [
    'duplicate environment',
    (s) => {
      s[0].Spec.TaskTemplate.ContainerSpec.Env.push(s[0].Spec.TaskTemplate.ContainerSpec.Env[0])
    },
  ],
  [
    'service missing',
    (s) => {
      s.pop()
    },
  ],
  [
    'wrong service name',
    (s) => {
      s[0].Spec.Name = 'beaconhs-ib9ybf_web'
    },
  ],
  [
    'image drift',
    (s) => {
      s[0].Spec.TaskTemplate.ContainerSpec.Image = 'other'
    },
  ],
  [
    'replica drift',
    (s) => {
      s[0].Spec.Mode.Replicated.Replicas = 1
    },
  ],
])
  test(`runtime rejects ${name}`, () => {
    const s = runtime()
    mutate(s)
    assert.throws(() => runtimeComparison(after, s))
  })
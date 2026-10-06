import assert from 'node:assert/strict'
import { test } from 'node:test'
import { liveIO, verifyReadiness } from './dev-readiness.mjs'
import { runInNewContext } from 'node:vm'

const config = {
  verified: 'true',
  stack: 'uvanoo-v1-4-dev-gniriv',
  host: 'dev.uvanoo.com',
  sha: 'a'.repeat(40),
  digest: `sha256:${'b'.repeat(64)}`,
}
const image = `ghcr.io/satho82/uvanoo-staging-private@${config.digest}`
function fixture() {
  const runtime = {
    id: 'container',
    running: true,
    healthy: true,
    service: `${config.stack}_web`,
    image,
    serviceImage: image,
    imageId: 'id',
    expectedId: 'id',
    digests: [image],
    revision: config.sha,
    version: [`APP_VERSION=${config.sha}`],
    replicas: 1,
  }
  const internal = { ready: 200, status: 'ready', sha: config.sha, login: 200 }
  const external = { status: 401, challenge: 'Basic realm="Uvanoo Development"' }
  return {
    runtime,
    internal,
    external,
    io: { runtime: () => runtime, internal: () => internal, external: () => external },
  }
}

test('exact internal readiness and login plus protected public login pass without credentials', async () => {
  await verifyReadiness(fixture().io, config)
})
for (const [field, value, code] of [
  ['sha', 'c'.repeat(40), 'READINESS_SHA_MISMATCH'],
  ['ready', 503, 'INTERNAL_NOT_READY'],
  ['ready', 401, 'INTERNAL_NOT_READY'],
  ['status', 'degraded', 'INTERNAL_NOT_READY'],
  ['login', 302, 'INTERNAL_LOGIN_FAILED'],
  ['login', 500, 'INTERNAL_LOGIN_FAILED'],
])
  test(`reject internal ${field}=${value}`, async () => {
    const f = fixture()
    f.internal[field] = value
    await assert.rejects(verifyReadiness(f.io, config), new RegExp(code))
  })
for (const [status, challenge] of [
  [200, 'Basic realm="Uvanoo Development"'],
  [302, null],
  [503, null],
  [401, null],
  [401, 'Bearer'],
  [401, 'Basic realm="Other"'],
  [401, 'Basic realm="Uvanoo Development", Bearer'],
])
  test(`reject unexpected external ${status}/${challenge}`, async () => {
    const f = fixture()
    f.external = { status, challenge }
    f.io.external = () => f.external
    await assert.rejects(verifyReadiness(f.io, config), /EXTERNAL_PROTECTION_FAILED/)
  })
for (const [field, value] of [
  ['image', 'wrong'],
  ['serviceImage', 'wrong'],
  ['imageId', 'wrong'],
  ['digests', []],
  ['revision', 'wrong'],
  ['version', []],
  ['healthy', false],
  ['replicas', 2],
  ['service', 'uvanoo-dev-web'],
])
  test(`reject runtime ${field} mismatch`, async () => {
    const f = fixture()
    f.runtime[field] = value
    await assert.rejects(verifyReadiness(f.io, config))
  })
test('reject container replacement during probes', async () => {
  const f = fixture()
  let calls = 0
  f.io.runtime = () => ({ ...f.runtime, id: String(calls++) })
  await assert.rejects(verifyReadiness(f.io, config), /WEB_CHANGED_DURING_PROBE/)
})
test('transport errors fail closed', async () => {
  const f = fixture()
  f.io.external = () => {
    throw new Error('network')
  }
  await assert.rejects(verifyReadiness(f.io, config))
})
test('live probes use only exact container loopback and credential-free HTTPS, with no redirects', async () => {
  const calls = []
  const io = liveIO(
    (file, args) => {
      calls.push([file, args])
      return JSON.stringify(fixture().internal)
    },
    async (url, options) => {
      assert.equal(url, 'https://dev.uvanoo.com/login')
      assert.equal(options.redirect, 'manual')
      assert.deepEqual(Object.keys(options).sort(), ['redirect', 'signal'])
      return new Response(null, {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="Uvanoo Development"' },
      })
    },
  )
  assert.deepEqual(io.internal('exact-container'), fixture().internal)
  assert.deepEqual(calls[0][1].slice(0, 4), ['exec', 'exact-container', 'node', '-e'])
  assert.match(calls[0][1][4], /http:\/\/127\.0\.0\.1:3000\/api\/health\/ready/)
  assert.match(calls[0][1][4], /http:\/\/127\.0\.0\.1:3000\/login/)
  assert.doesNotMatch(calls[0][1][4], /Authorization|password|process.env/)
  assert.equal((await io.external()).status, 401)
})

test('live runtime inspection binds service, container and digest without returning secrets', () => {
  const io = liveIO((_file, args) => {
    if (args[0] === 'ps') return 'container\n'
    if (args[0] === 'service')
      return JSON.stringify([
        {
          Spec: {
            Mode: { Replicated: { Replicas: 1 } },
            TaskTemplate: { ContainerSpec: { Image: image } },
          },
        },
      ])
    if (args[0] === 'image') return JSON.stringify([{ Id: 'id', RepoDigests: [image] }])
    assert.deepEqual(args, ['inspect', 'container'])
    return JSON.stringify([
      {
        Id: 'container',
        Image: 'id',
        State: { Running: true, Health: { Status: 'healthy' } },
        Config: {
          Image: image,
          Env: [`APP_VERSION=${config.sha}`, 'PASSWORD=never-output'],
          Labels: {
            'com.docker.swarm.service.name': `${config.stack}_web`,
            'org.opencontainers.image.revision': config.sha,
          },
        },
      },
    ])
  })
  assert.deepEqual(io.runtime(image), fixture().runtime)
  assert.doesNotMatch(JSON.stringify(io.runtime(image)), /PASSWORD|never-output/)
  assert.throws(() => liveIO(() => 'one\ntwo\n').runtime(image), /WEB_CONTAINER_AMBIGUOUS/)
})

test('execute actual in-container probe: preserve status and SHA, reject transport errors', async () => {
  let source
  liveIO((_file, args) => {
    source = args[4]
    return '{}'
  }).internal('container')
  let result
  await runInNewContext(source, {
    AbortSignal,
    console: {
      log: (line) => {
        result = JSON.parse(line)
      },
    },
    process: {
      exit: () => {
        throw new Error('probe failed')
      },
    },
    fetch: async (url, options) => {
      assert.equal(options.redirect, 'manual')
      return {
        status: url.endsWith('/login') ? 200 : 503,
        json: async () => ({ status: 'degraded', version: config.sha }),
      }
    },
  })
  assert.deepEqual(result, { ready: 503, status: 'degraded', sha: config.sha, login: 200 })
  await assert.rejects(
    runInNewContext(source, {
      AbortSignal,
      process: {
        exit: () => {
          throw new Error('probe failed')
        },
      },
      fetch: async () => {
        throw new Error('connection refused')
      },
    }),
    /probe failed/,
  )
})

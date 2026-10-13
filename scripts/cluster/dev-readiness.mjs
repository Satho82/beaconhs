import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const protectedPaths = ['/hospitality/risk', '/people', '/approvals']
const service = 'uvanoo-v1-4-dev-gniriv_web'
const check = (condition, code) => {
  if (!condition) throw new Error(code)
}

// Runs inside the exact inspected web container, never through Traefik.
const probe = `
  (async () => {
    const options = { redirect: 'manual', signal: AbortSignal.timeout(15000) };
    const ready = await fetch('http://127.0.0.1:3000/api/health/ready', options);
    const body = await ready.json().catch(() => ({}));
    const login = await fetch('http://127.0.0.1:3000/login', {
      redirect: 'manual', signal: AbortSignal.timeout(15000)
    });
    console.log(JSON.stringify({ ready: ready.status, status: body.status,
      sha: body.version, login: login.status }));
  })().catch(() => process.exit(1));
`

export function liveIO(exec = execFileSync, request = fetch) {
  const docker = (args) =>
    exec('docker', args, {
      encoding: 'utf8',
      timeout: 40000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  const inspect = (args) => JSON.parse(docker(args))[0]
  return {
    runtime(image) {
      const ids = docker(['ps', '-q', '--filter', `label=com.docker.swarm.service.name=${service}`])
        .trim()
        .split(/\s+/)
        .filter(Boolean)
      check(ids.length === 1, 'WEB_CONTAINER_AMBIGUOUS')
      const container = inspect(['inspect', ids[0]])
      const spec = inspect(['service', 'inspect', service])
      const expected = inspect(['image', 'inspect', image])
      // Do not return or print the container environment or other secrets.
      return {
        id: container.Id,
        running: container.State?.Running,
        healthy: container.State?.Health?.Status === 'healthy',
        service: container.Config?.Labels?.['com.docker.swarm.service.name'],
        image: container.Config?.Image,
        imageId: container.Image,
        expectedId: expected.Id,
        digests: expected.RepoDigests,
        revision: container.Config?.Labels?.['org.opencontainers.image.revision'],
        version: container.Config?.Env?.filter((item) => item.startsWith('APP_VERSION=')),
        serviceImage: spec.Spec?.TaskTemplate?.ContainerSpec?.Image,
        replicas: spec.Spec?.Mode?.Replicated?.Replicas,
      }
    },
    internal: (id) => JSON.parse(docker(['exec', id, 'node', '-e', probe])),
    async external() {
      const response = await request('https://dev.uvanoo.com/login', {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      })
      await response.body?.cancel()
      const protectedRoutes = []
      for (const path of protectedPaths) {
        const route = await request('https://dev.uvanoo.com' + path, {
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
        })
        await route.body?.cancel()
        protectedRoutes.push({
          path,
          status: route.status,
          location: route.headers.get('location'),
          challenge: route.headers.get('www-authenticate'),
        })
      }
      return {
        status: response.status,
        challenge: response.headers.get('www-authenticate'),
        protectedRoutes,
      }
    },
  }
}

export async function verifyReadiness(io, config) {
  check(
    config.verified === 'true' &&
      config.stack === 'uvanoo-v1-4-dev-gniriv' &&
      config.host === 'dev.uvanoo.com',
    'DEV_CONTEXT_REQUIRED',
  )
  check(
    /^[0-9a-f]{40}$/.test(config.sha) && /^sha256:[0-9a-f]{64}$/.test(config.digest),
    'CANDIDATE_IDENTITY_INVALID',
  )
  const image = `ghcr.io/satho82/uvanoo-staging-private@${config.digest}`
  const validate = (runtime) => {
    check(
      runtime.id &&
        runtime.running &&
        runtime.healthy &&
        runtime.service === service &&
        runtime.replicas === 1,
      'WEB_NOT_HEALTHY',
    )
    check(
      runtime.image === image &&
        runtime.serviceImage === image &&
        runtime.imageId &&
        runtime.imageId === runtime.expectedId &&
        runtime.digests?.includes(image),
      'RUNTIME_DIGEST_MISMATCH',
    )
    check(
      runtime.revision === config.sha &&
        runtime.version?.length === 1 &&
        runtime.version[0] === `APP_VERSION=${config.sha}`,
      'RUNTIME_SHA_MISMATCH',
    )
  }
  const before = await io.runtime(image)
  validate(before)
  const internal = await io.internal(before.id)
  check(internal.ready === 200 && internal.status === 'ready', 'INTERNAL_NOT_READY')
  check(internal.sha === config.sha, 'READINESS_SHA_MISMATCH')
  check(internal.login === 200, 'INTERNAL_LOGIN_FAILED')
  const external = await io.external()
  check(
    external.status === 200 && !external.challenge,
    'EXTERNAL_PROTECTION_FAILED',
  )
  check(
    external.protectedRoutes?.length === protectedPaths.length &&
      external.protectedRoutes.every((route, index) => {
        if (
          route.path !== protectedPaths[index] ||
          ![302, 303, 307, 308].includes(route.status) ||
          route.challenge ||
          !route.location
        )
          return false
        try {
          const target = new URL(route.location, 'https://dev.uvanoo.com')
          return (
            target.origin === 'https://dev.uvanoo.com' &&
            target.pathname === '/login' &&
            !target.username &&
            !target.password
          )
        } catch {
          return false
        }
      }),
    'UNAUTHENTICATED_ROUTE_EXPOSED',
  )
  const after = await io.runtime(image)
  validate(after)
  check(before.id === after.id, 'WEB_CHANGED_DURING_PROBE')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = {
    verified: process.env.FEATURE_CANDIDATE_VERIFIED,
    stack: process.env.DOKPLOY_TARGET_STACK,
    host: process.env.EXPECTED_APP_HOST,
    sha: process.env.DEPLOY_SOURCE_SHA,
    digest: process.env.IMAGE_DIGEST,
  }
  // The writer restore already waits for healthy convergence. Any subsequent
  // identity, application or protection failure must close this final gate.
  verifyReadiness(liveIO(), config)
    .then(() => {
      console.log(`DEV internal readiness/login and immutable runtime verified: ${config.sha}`)
      console.log('DEV native login verified: HTTP 200, no Basic challenge; protected routes require login')
    })
    .catch((error) => {
      const safe = new Set([
        'DEV_CONTEXT_REQUIRED',
        'CANDIDATE_IDENTITY_INVALID',
        'WEB_CONTAINER_AMBIGUOUS',
        'WEB_NOT_HEALTHY',
        'RUNTIME_DIGEST_MISMATCH',
        'RUNTIME_SHA_MISMATCH',
        'INTERNAL_NOT_READY',
        'READINESS_SHA_MISMATCH',
        'INTERNAL_LOGIN_FAILED',
        'EXTERNAL_PROTECTION_FAILED',
        'UNAUTHENTICATED_ROUTE_EXPOSED',
        'WEB_CHANGED_DURING_PROBE',
      ])
      console.error(
        `::error::DEV readiness failed [${safe.has(error.message) ? error.message : 'PROBE_FAILED'}]`,
      )
      process.exitCode = 1
    })
}

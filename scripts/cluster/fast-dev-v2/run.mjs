import { execFileSync } from 'node:child_process'
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { TARGET, patchEnv, release, requireValue as check } from './release.mjs'
import { verifyReadiness, liveIO } from '../dev-readiness.mjs'
import { readinessFetch } from './streaming-redirect.mjs'

const command = (exe, args) =>
  execFileSync(exe, args, {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
const docker = (...args) => command('docker', args)
const inspect = (...args) => JSON.parse(docker(...args))[0]
const git = (...args) => command('git', args).trim()
const envValue = (env, key) => {
  const values = env.split('\n').filter((line) => line.startsWith(key + '='))
  check(values.length === 1, 'ENV_KEY_AMBIGUOUS')
  return values[0].slice(key.length + 1)
}
const image = (digest) => `${TARGET.image}@${digest}`
const api = async (method, body) => {
  const token = readFileSync('/opt/uvanoo-dev/monitor-private/dokploy.token', 'utf8').trim()
  const response = await fetch(
    `http://127.0.0.1:3000/api/compose.${method}${body ? '' : '?composeId=' + TARGET.composeId}`,
    {
      method: body ? 'POST' : 'GET',
      headers: { 'x-api-key': token, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    },
  )
  check(response.ok, 'DOKPLOY_REQUEST_FAILED')
  return response.json()
}
const compose = async () => {
  const d = await api('one')
  check(
    d.composeId === TARGET.composeId &&
      d.appName === TARGET.stack &&
      d.environmentId === TARGET.environmentId &&
      d.serverId === null &&
      d.autoDeploy === false,
    'TARGET_MISMATCH',
  )
  check(
    d.domains?.length === 1 &&
      d.domains[0].host === 'dev.uvanoo.com' &&
      d.domains[0].https === true &&
      d.domains[0].serviceName === 'web',
    'DOMAIN_MISMATCH',
  )
  check(envValue(d.env, 'APP_URL') === TARGET.origin, 'ORIGIN_MISMATCH')
  for (const key of ['DATABASE_URL', 'SUPERADMIN_DATABASE_URL']) {
    const u = new URL(envValue(d.env, key))
    check(
      u.hostname === 'uvanoo-dev-postgres' && u.pathname === '/uvanoo_dev',
      'DATABASE_TARGET_MISMATCH',
    )
  }
  for (const key of ['WORKER_REPLICAS', 'SCHEDULER_REPLICAS', 'STORAGE_INIT_REPLICAS'])
    check(envValue(d.env, key) === '0', 'BACKGROUND_JOBS_NOT_FENCED')
  check(
    envValue(d.env, 'WEB_REPLICAS') === '1' &&
      envValue(d.env, 'UVANOO_DEV_TELEMETRY_BOOTSTRAP') === '',
    'DEV_NOT_IN_NORMAL_MODE',
  )
  check(
    d.composeFile.includes('image: ${IMAGE}') &&
      d.composeFile.includes('APP_VERSION: ${APP_VERSION}'),
    'COMPOSE_IMAGE_BINDING_MISSING',
  )
  return d
}
const service = () => inspect('service', 'inspect', `${TARGET.stack}_web`)
const journal = resolve(process.env.DEV_V2_JOURNAL ?? '/tmp/uvanoo-dev-v2-release.jsonl')
const record = async (event, facts) =>
  appendFileSync(
    journal,
    JSON.stringify({ at: new Date().toISOString(), event, ...facts }) + '\n',
    { mode: 0o600 },
  )
const io = {
  async snapshot() {
    const d = await compose()
    const s = service()
    const sha = envValue(d.env, 'APP_VERSION')
    const current = envValue(d.env, 'IMAGE')
    check(current.startsWith(TARGET.image + '@sha256:'), 'LIVE_IMAGE_NOT_IMMUTABLE')
    const digest = current.split('@')[1]
    check(
      s.Spec.TaskTemplate.ContainerSpec.Image === current &&
        s.Spec.TaskTemplate.ContainerSpec.Env.includes(`APP_VERSION=${sha}`),
      'CONTROL_PLANE_RUNTIME_DRIFT',
    )
    return { sha, digest, env: d.env, composeFile: d.composeFile, serviceVersion: s.Version.Index }
  },
  async diff(base, sha) {
    const changes = command('git', ['diff', '--name-status', '-z', '--no-renames', base, sha])
    let ancestor = true
    try {
      git('merge-base', '--is-ancestor', base, sha)
    } catch {
      ancestor = false
    }
    return { changes, ancestor }
  },
  async verifyCI(sha) {
    const runs = JSON.parse(
      command('gh', [
        'api',
        `repos/${TARGET.repository}/actions/workflows/uvanoo-v1.4-cloud-build.yml/runs?head_sha=${sha}&status=completed&per_page=100`,
      ]),
    )
    check(runs.total_count <= 100, 'CI_LOOKUP_OVERFLOW')
    const run = runs.workflow_runs.find(
      (r) =>
        r.head_sha === sha && r.head_branch === 'feature/uvanoo-v1.4' && r.conclusion === 'success',
    )
    check(run, 'EXACT_SOURCE_FULL_CI_REQUIRED')
    const jobs = JSON.parse(
      command('gh', ['api', `repos/${TARGET.repository}/actions/runs/${run.id}/jobs?per_page=100`]),
    )
    check(jobs.total_count <= 100, 'CI_JOB_LOOKUP_OVERFLOW')
    for (const name of ['Validate frozen V1.4 source', 'Publish immutable V1.4 DEV candidate'])
      check(
        jobs.jobs.filter((j) => j.name === name && j.conclusion === 'success').length === 1,
        'CI_REQUIRED_JOB_MISSING',
      )
  },
  async verifyImage(sha, digest) {
    check(/^sha256:[a-f0-9]{64}$/.test(digest), 'INVALID_DIGEST')
    // Workflow pre-pulls the immutable image using an ephemeral registry credential.
    const d = inspect('image', 'inspect', image(digest))
    check(
      d.RepoDigests?.includes(image(digest)) &&
        d.Config.Labels?.['org.opencontainers.image.revision'] === sha &&
        d.Config.Labels?.['org.opencontainers.image.version'] === `v1.4-dev-${sha}`,
      'IMAGE_PROVENANCE_MISMATCH',
    )
  },
  async checkPaused() {
    for (const role of ['worker', 'scheduler', 'storage-init']) {
      const d = inspect('service', 'inspect', `${TARGET.stack}_${role}`)
      check(d.Spec.Mode.Replicated.Replicas === 0, 'BACKGROUND_REPLAY_FORBIDDEN')
      const ids = docker('service', 'ps', '-q', '--no-trunc', d.ID)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
      if (ids.length)
        check(
          JSON.parse(docker('inspect', ...ids)).every((t) =>
            ['shutdown', 'complete', 'failed', 'rejected', 'remove'].includes(t.Status.State),
          ),
          'BACKGROUND_TASK_ACTIVE',
        )
    }
  },
  async preflight(before) {
    await io.checkPaused()
    for (const name of ['uvanoo-dev-postgres', 'uvanoo-dev-redis', 'uvanoo-dev-minio']) {
      const d = inspect('inspect', name)
      check(d.State.Running && d.State.Health?.Status === 'healthy', 'INFRASTRUCTURE_UNHEALTHY')
    }
    await io.ready(before)
  },
  async assertUnchanged(before) {
    const now = await io.snapshot()
    check(JSON.stringify(now) === JSON.stringify(before), 'CONCURRENT_CONFIGURATION_CHANGE')
  },
  async persist(from, to) {
    const d = await compose()
    const wanted = patchEnv(to.env, { IMAGE: image(to.digest), APP_VERSION: to.sha })
    const expected = patchEnv(from.env, { IMAGE: image(from.digest), APP_VERSION: from.sha })
    check(
      d.composeFile === from.composeFile && [expected, wanted].includes(d.env),
      'CONFIG_DRIFT_DO_NOT_OVERWRITE',
    )
    await api('update', { composeId: TARGET.composeId, env: wanted, composeFile: d.composeFile })
    check((await compose()).env === wanted, 'CONFIG_PERSISTENCE_FAILED')
  },
  async rollout(to) {
    // Only web changes. Do not redeploy the entire stack or wake historical jobs.
    docker(
      'service',
      'update',
      '--detach=true',
      '--image',
      image(to.digest),
      '--env-add',
      `APP_VERSION=${to.sha}`,
      '--env-add',
      `UVANOO_RECOVERY_SOURCE_SHA=${to.sha}`,
      `${TARGET.stack}_web`,
    )
  },
  async ready(to) {
    for (let attempt = 0; attempt < 36; attempt++) {
      try {
        await verifyReadiness(liveIO(undefined, readinessFetch), {
          verified: 'true',
          stack: TARGET.stack,
          host: 'dev.uvanoo.com',
          sha: to.sha,
          digest: to.digest,
        })
        const discovery = await fetch(TARGET.origin + '/hosting/discovery', {
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        })
        check(
          discovery.ok && (await discovery.text()).includes('<wopi-discovery>'),
          'EDITOR_ROUTE_FAILED',
        )
        return
      } catch {
        if (attempt === 35) throw new Error('READINESS_TIMEOUT')
        await new Promise((done) => setTimeout(done, 5000))
      }
    }
  },
  async smoke(sha, write) {
    command('node', [
      resolve('scripts/cluster/fast-dev-v2/smoke.mjs'),
      sha,
      write ? '--create' : '--read-only',
    ])
  },
  record,
}
try {
  mkdirSync(resolve(journal, '..'), { recursive: true, mode: 0o700 })
  const result = await release(io, {
    repository: process.env.GITHUB_REPOSITORY ?? TARGET.repository,
    sha: process.env.DEV_SOURCE_SHA,
    digest: process.env.DEV_IMAGE_DIGEST,
    execute: process.argv.includes('--execute'),
    enabled: process.env.DEV_FAST_V2_ENABLED === 'true',
    authorized: process.env.DEV_OWNER_AUTHORIZED === 'true',
    compatible: process.env.DEV_BACKWARD_COMPATIBLE === 'true',
  })
  console.log(JSON.stringify(result))
} catch (error) {
  // Never emit child-process stderr, API responses, service specs or credentials.
  const code = /^[A-Z_]+$/.test(error.message) ? error.message : 'DEV_V2_OPERATION_FAILED'
  await record('failed', { code })
  console.error(code)
  process.exitCode = 1
}

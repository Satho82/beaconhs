import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, appendFileSync, mkdirSync, openSync, fstatSync, constants } from 'node:fs'
import { resolve } from 'node:path'
import {
  TARGET,
  assertBuildProvenance,
  assertLiveFastSafety,
  assertRecoverySourceBinding,
  persistConfiguration,
  release,
  requireValue as check,
} from './release.mjs'
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
  const token = readFileSync('/opt/uvanoo-dev/fast-v2-credentials/dokploy.token', 'utf8').trim()
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
  assertRecoverySourceBinding(d.composeFile)
  return d
}
const service = () => inspect('service', 'inspect', `${TARGET.stack}_web`)
const journal = resolve(process.env.DEV_V2_JOURNAL ?? '/tmp/uvanoo-dev-v2-release.jsonl')
let journalFd
const record = async (event, facts) =>
  appendFileSync(
    journalFd,
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
        s.Spec.TaskTemplate.ContainerSpec.Env.includes(`APP_VERSION=${sha}`) &&
        s.Spec.TaskTemplate.ContainerSpec.Env.includes(`UVANOO_RECOVERY_SOURCE_SHA=${sha}`),
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
  async verifyCI(sha, digest) {
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
    const imageJob = jobs.jobs.find((job) => job.name === 'Publish immutable V1.4 DEV candidate')
    check(Number.isSafeInteger(imageJob?.id), 'CI_PUBLISH_JOB_MISSING')
    const buildLog = command('gh', [
      'api',
      `repos/${TARGET.repository}/actions/jobs/${imageJob.id}/logs`,
    ])
    assertBuildProvenance(buildLog, sha, digest)
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
    const journal = JSON.parse(git('show', `${before.sha}:packages/db/drizzle/meta/_journal.json`))
    const expected = journal.entries.map((entry) => ({
      hash: createHash('sha256')
        .update(command('git', ['show', `${before.sha}:packages/db/drizzle/${entry.tag}.sql`]))
        .digest('hex'),
      created_at: String(entry.when),
    }))
    const ledger = JSON.parse(
      docker(
        'exec',
        'uvanoo-dev-postgres',
        'psql',
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'uvanoo_dev',
        '-d',
        'uvanoo_dev',
        '-c',
        "BEGIN READ ONLY; SELECT coalesce(json_agg(x ORDER BY created_at), '[]'::json) FROM (SELECT hash, created_at::text FROM drizzle.__drizzle_migrations) x; ROLLBACK;",
      ),
    )
    check(JSON.stringify(ledger) === JSON.stringify(expected), 'LIVE_MIGRATION_LEDGER_DRIFT')
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
  async verifyActivationSafety() {
    assertLiveFastSafety()
  },
  async persist(from, to) {
    await persistConfiguration({ compose, api }, from, to)
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
  const candidateJournalFd = openSync(
    journal,
    constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
    0o600,
  )
  const journalStat = fstatSync(candidateJournalFd)
  check(
    journalStat.isFile() &&
      journalStat.uid === process.getuid() &&
      (journalStat.mode & 0o077) === 0,
    'JOURNAL_PERMISSIONS_INVALID',
  )
  journalFd = candidateJournalFd
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
  if (journalFd !== undefined) await record('failed', { code })
  console.error(code)
  process.exitCode = 1
}

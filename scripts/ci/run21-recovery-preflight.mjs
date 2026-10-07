import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

export const sha = '3e753ac2306e7866fe2d3e8af3fd64188bc9e13a'
export const digest = 'sha256:28ecd078f472b4402fffdcf88c3b932a97e93bde45ca6b39a440668862c27144'
const image = `ghcr.io/satho82/uvanoo-staging-private@${digest}`
const stack = 'uvanoo-v1-4-dev-gniriv'
const roles = ['web', 'worker', 'scheduler']
const terminal = new Set(['complete', 'shutdown', 'failed', 'rejected', 'remove'])
const check = (ok, code) => {
  if (!ok) throw new Error(code)
}
const exec = (file, args, input) =>
  execFileSync(file, args, {
    input,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
const docker = (...args) => exec('docker', args)
const inspect = (...args) => JSON.parse(docker(...args))

export function validateSnapshot(s, phase) {
  check(['before', 'zero', 'after'].includes(phase), 'INVALID_PHASE')
  check(!s.legacyRunning, 'LEGACY_WRITER_RUNNING')
  check(s.revision === sha && s.version === `v1.4-dev-${sha}`, 'OCI_IDENTITY_MISMATCH')
  check(s.services.length === 3, 'WRITER_SERVICE_AMBIGUOUS')
  for (const role of roles) {
    const service = s.services.find((x) => x.Spec.Name === `${stack}_${role}`)
    check(service, 'WRITER_SERVICE_MISSING')
    const spec = service.Spec.TaskTemplate.ContainerSpec
    check(spec.Image === image && spec.Env.includes(`APP_VERSION=${sha}`), 'SERVICE_IDENTITY_DRIFT')
    const expected = phase === 'zero' || (phase === 'before' && role === 'web') ? 0 : 1
    check(service.Spec.Mode.Replicated.Replicas === expected, 'UNEXPECTED_WRITER_TOPOLOGY')
    check(!/paused|rollback/.test(service.UpdateStatus?.State ?? ''), 'WRITER_UPDATE_FAILED')
    const tasks = s.tasks.filter((x) => x.ServiceID === service.ID)
    check(
      tasks.every((x) => typeof x.Status?.State === 'string'),
      'TASK_STATE_AMBIGUOUS',
    )
    const active = tasks.filter((x) => !terminal.has(x.Status.State))
    if (expected === 0 || role === 'scheduler') check(active.length === 0, 'WRITER_STILL_ACTIVE')
    if (expected === 1 && role === 'scheduler') {
      check(
        tasks.some(
          (x) =>
            x.Status.State === 'complete' &&
            x.Status.ContainerStatus?.ExitCode === 0 &&
            x.Spec.ContainerSpec.Image === image &&
            x.Spec.ContainerSpec.Env.includes(`APP_VERSION=${sha}`),
        ),
        'SCHEDULER_NOT_COMPLETE',
      )
    } else if (expected === 1) {
      check(
        active.length === 1 &&
          active[0].Status.State === 'running' &&
          active[0].DesiredState === 'running' &&
          active[0].health === 'healthy' &&
          active[0].Spec.ContainerSpec.Image === image &&
          active[0].Spec.ContainerSpec.Env.includes(`APP_VERSION=${sha}`),
        'WRITER_NOT_HEALTHY',
      )
    }
  }
  check(s.db.prepared === 0, 'PREPARED_TRANSACTIONS')
  if (phase !== 'after') check(s.db.open === 0, 'OPEN_TRANSACTIONS')
  check(
    s.db.sessions.every(
      (x) =>
        s.allowedAddresses.includes(x.client_addr) &&
        ['beaconhs_app', 'beaconhs_super'].includes(x.usename),
    ),
    'UNEXPECTED_DATABASE_WRITER',
  )
  if (phase === 'zero') check(s.db.sessions.length === 0, 'DATABASE_WRITERS_REMAIN')
}

function snapshot() {
  const services = inspect('service', 'inspect', ...roles.map((r) => `${stack}_${r}`))
  const ids = [
    ...new Set(
      roles.flatMap((r) =>
        docker('service', 'ps', '-q', '--no-trunc', `${stack}_${r}`)
          .trim()
          .split(/\s+/)
          .filter(Boolean),
      ),
    ),
  ]
  const tasks = ids.length ? inspect('inspect', ...ids) : []
  const allowedAddresses = []
  for (const task of tasks.filter((x) => x.Status.State === 'running')) {
    const [container] = inspect('inspect', task.Status.ContainerStatus.ContainerID)
    task.health = container.State.Health?.Status
    allowedAddresses.push(
      ...Object.values(container.NetworkSettings.Networks)
        .map((n) => n.IPAddress)
        .filter(Boolean),
    )
  }
  const legacyIds = docker('ps', '-aq', '--filter', 'name=^/uvanoo-dev-web$')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const legacyRunning = legacyIds.length
    ? inspect('inspect', ...legacyIds).some((x) => x.State.Running)
    : false
  const [localImage] = inspect('image', 'inspect', image)
  const sql = `SELECT json_build_object(
    'open',(SELECT count(*) FROM pg_stat_activity WHERE datname='beaconhs' AND backend_type='client backend' AND xact_start IS NOT NULL),
    'prepared',(SELECT count(*) FROM pg_prepared_xacts WHERE database='beaconhs'),
    'sessions',COALESCE((SELECT json_agg(t) FROM (SELECT usename,host(client_addr) AS client_addr,state FROM pg_stat_activity WHERE datname='beaconhs' AND backend_type='client backend') t),'[]'::json));`
  const db = JSON.parse(
    exec(
      'docker',
      [
        'exec',
        '-i',
        'uvanoo-dev-postgres',
        'sh',
        '-c',
        'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d uvanoo_dev',
      ],
      sql,
    ),
  )
  return {
    services,
    tasks,
    allowedAddresses,
    legacyRunning,
    db,
    revision: localImage.Config.Labels['org.opencontainers.image.revision'],
    version: localImage.Config.Labels['org.opencontainers.image.version'],
  }
}

async function savedTarget(count = '1') {
  const { target } = await import(
    pathToFileURL(join(process.cwd(), 'scripts/cluster/dev-writer-fence.mjs'))
  )
  check(process.env.DOKPLOY_URL === 'https://dokploy.uvanoo.com', 'CONTROL_PLANE_ORIGIN_MISMATCH')
  check(
    process.env.DOKPLOY_CURL_RESOLVE?.startsWith('dokploy.uvanoo.com:443:'),
    'CONTROL_PLANE_RESOLVE_MISSING',
  )
  const state = JSON.parse(
    exec('bash', [
      'scripts/cluster/dokploy-curl.sh',
      '-sS',
      '--fail',
      '--connect-timeout',
      '5',
      '--max-time',
      '20',
      '--noproxy',
      'dokploy.uvanoo.com',
      '--resolve',
      process.env.DOKPLOY_CURL_RESOLVE,
      '-G',
      '--data-urlencode',
      'composeId=wYb0LxLQrvj2FPI21i-Oj',
      `${process.env.DOKPLOY_URL}/api/compose.one`,
    ]),
  )
  target(state)
  for (const [key, value] of Object.entries({
    IMAGE: image,
    APP_VERSION: sha,
    WRITER_REPLICAS: count,
  })) {
    const lines = state.env.split('\n').filter((x) => x.startsWith(`${key}=`))
    check(lines.length === 1 && lines[0] === `${key}=${value}`, 'SAVED_CANDIDATE_IDENTITY_MISMATCH')
  }
  return state
}

async function settled() {
  let previous
  for (let attempt = 0; attempt < 60; attempt++) {
    const state = await savedTarget('0')
    check(state.composeStatus !== 'error', 'CONTROL_PLANE_DEPLOY_FAILED')
    const [service] = inspect('service', 'inspect', `${stack}_collabora`)
    check(!/paused|rollback/.test(service.UpdateStatus?.State ?? ''), 'COLLABORA_UPDATE_FAILED')
    const version = service.Version.Index
    if (
      state.composeStatus === 'done' &&
      (!service.UpdateStatus || service.UpdateStatus.State === 'completed')
    ) {
      if (previous === version) {
        console.log('Dokploy fence deployment finished; Collabora service version stable')
        return
      }
      previous = version
    } else previous = undefined
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  throw new Error('CONTROL_PLANE_NOT_SETTLED')
}

function evidence() {
  const api = (path) => JSON.parse(exec('gh', ['api', `repos/Satho82/beaconhs/${path}`]))
  check(api('git/ref/heads/feature/uvanoo-v1.4').object.sha === sha, 'FEATURE_HEAD_CHANGED')
  for (const id of [37605920552, 37605920576]) {
    const run = api(`actions/runs/${id}`)
    check(
      run.head_sha === sha &&
        run.head_branch === 'feature/uvanoo-v1.4' &&
        run.status === 'completed' &&
        run.conclusion === 'success',
      'AUTHORITATIVE_CI_NOT_GREEN',
    )
  }
  const run = api('actions/runs/37614804748')
  check(
    run.head_sha === sha &&
      run.head_branch === 'feature/uvanoo-v1.4' &&
      run.conclusion === 'failure',
    'RUN21_IDENTITY_MISMATCH',
  )
  const job = api('actions/jobs/112770852076')
  check(job.run_id === 37614804748, 'RUN21_JOB_MISMATCH')
  for (const [name, conclusion] of [
    ['Persist apply and verify DEV writer fence', 'success'],
    ['Run database migrations', 'success'],
    ['Restore verified DEV candidate writers', 'failure'],
  ]) {
    check(
      job.steps.filter((s) => s.name === name && s.conclusion === conclusion).length === 1,
      'RUN21_RECOVERY_NOT_ELIGIBLE',
    )
  }
  console.log('Exact candidate CI and successful Run 21 migration verified; recovery only')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const phase = process.argv[2]
  try {
    check(
      process.env.DEPLOY_SOURCE_SHA === sha && process.env.IMAGE_DIGEST === digest,
      'RECOVERY_IDENTITY_MISMATCH',
    )
    if (phase === 'evidence') evidence()
    else if (phase === 'settled') await settled()
    else {
      if (phase === 'before') await savedTarget()
      const s = snapshot()
      validateSnapshot(s, phase)
      console.log(
        JSON.stringify({
          phase,
          sha,
          digest,
          openTransactions: s.db.open,
          preparedTransactions: s.db.prepared,
          databaseClients: s.db.sessions,
          legacyRunning: s.legacyRunning,
          services: s.services.map((x) => ({
            name: x.Spec.Name,
            desired: x.Spec.Mode.Replicated.Replicas,
          })),
          tasks: s.tasks.map((x) => ({
            id: x.ID,
            state: x.Status.State,
            health: x.health,
            exit: x.Status.ContainerStatus?.ExitCode,
          })),
        }),
      )
    }
  } catch (error) {
    console.error(
      `::error::Recovery stopped [${/^[A-Z_]+$/.test(error.message) ? error.message : 'READ_ONLY_PREFLIGHT_FAILED'}]`,
    )
    process.exitCode = 1
  }
}

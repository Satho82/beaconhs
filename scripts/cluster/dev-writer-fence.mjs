import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const composeId = 'wYb0LxLQrvj2FPI21i-Oj'
const stack = 'uvanoo-v1-4-dev-gniriv'
export const writers = ['web', 'worker', 'scheduler']
const terminal = new Set(['complete', 'shutdown', 'failed', 'rejected', 'remove'])
const check = (condition, code) => {
  if (!condition) throw new Error(code)
}

export function replicas(env, value) {
  check(typeof env === 'string', 'ENV_MISSING')
  const lines = env.split('\n')
  const matches = lines.filter((line) => /^\s*(?:export\s+)?WRITER_REPLICAS\s*=/.test(line))
  check(matches.length === 1 && /^WRITER_REPLICAS=[01]\r?$/.test(matches[0]), 'FENCE_ENV_AMBIGUOUS')
  return lines.map((line) => (line === matches[0] ? `WRITER_REPLICAS=${value}` : line)).join('\n')
}

export function target(state) {
  check(
    state.composeId === composeId &&
      state.appName === stack &&
      state.serverId === null &&
      state.environmentId === 'qT391QtcIqahNap5wPjif' &&
      state.composeType === 'stack' &&
      state.sourceType === 'raw' &&
      state.autoDeploy === false &&
      state.domains?.length === 1 &&
      state.domains[0].composeId === composeId &&
      state.domains[0].host === 'dev.uvanoo.com' &&
      state.domains[0].serviceName === 'web' &&
      state.domains[0].port === 3000 &&
      state.domains[0].https === true &&
      state.domains[0].enabled === true &&
      state.domains[0].path === '/',
    'DEV_TARGET_MISMATCH',
  )
  replicas(state.env, 0)
}

export function runtimeReady(
  services,
  tasks,
  count,
  image,
  sha,
  restored = false,
  oldTasks = new Set(),
) {
  check(services.length === writers.length, 'WRITER_SERVICE_AMBIGUOUS')
  return writers.every((role) => {
    const service = services.find((item) => item.Spec?.Name === `${stack}_${role}`)
    check(service?.ID && service.Spec.TaskTemplate?.ContainerSpec, 'WRITER_SERVICE_MISSING')
    check(
      service.Spec.Mode?.Replicated && Number.isInteger(service.Spec.Mode.Replicated.Replicas),
      'WRITER_MODE_AMBIGUOUS',
    )
    const spec = service.Spec.TaskTemplate.ContainerSpec
    if (image && (spec.Image !== image || !spec.Env?.includes(`APP_VERSION=${sha}`))) return false
    if (service.Spec.Mode.Replicated.Replicas !== count) return false
    if (
      ['paused', 'rollback_started', 'rollback_paused', 'rollback_completed'].includes(
        service.UpdateStatus?.State,
      )
    ) {
      throw new Error('WRITER_UPDATE_FAILED')
    }
    const all = tasks.filter((task) => task.ServiceID === service.ID)
    for (const task of all) check(typeof task.Status?.State === 'string', 'TASK_STATE_AMBIGUOUS')
    // Inspect actual status of ALL tasks, including tasks whose desired state is
    // shutdown but which are still running. No desired-state filter is safe here.
    const active = all.filter((task) => !terminal.has(task.Status.State))
    if (count === 0) return active.length === 0
    if (!restored) return false
    if (role === 'scheduler') {
      return (
        active.length === 0 &&
        all.some(
          (task) =>
            !oldTasks.has(task.ID) &&
            task.Spec?.ContainerSpec?.Image === image &&
            task.Spec.ContainerSpec.Env?.includes(`APP_VERSION=${sha}`) &&
            task.Status.State === 'complete' &&
            task.Status.ContainerStatus?.ExitCode === 0,
        )
      )
    }
    return (
      active.length === 1 &&
      active[0].Status.State === 'running' &&
      active[0].health === 'healthy' &&
      active[0].DesiredState === 'running' &&
      active[0].Spec?.ContainerSpec?.Image === image &&
      active[0].Spec.ContainerSpec.Env?.includes(`APP_VERSION=${sha}`)
    )
  })
}

export async function runFence(mode, io, config) {
  check(
    config.verified === 'true' &&
      config.mode === 'api' &&
      config.stack === stack &&
      config.composeId === composeId &&
      config.host === 'dev.uvanoo.com',
    'DEV_CONTEXT_REQUIRED',
  )
  check(
    /^[0-9a-f]{40}$/.test(config.sha) && /^sha256:[0-9a-f]{64}$/.test(config.digest),
    'CANDIDATE_IDENTITY_INVALID',
  )
  const image = `ghcr.io/satho82/uvanoo-staging-private@${config.digest}`
  const read = async () => {
    const state = await io.get()
    target(state)
    return state
  }
  const persist = async (before, count) => {
    const env = replicas(before.env, count)
    await io.update({ composeId, env })
    const after = await read()
    check(
      after.env === env && after.composeFile === before.composeFile,
      'FENCE_PERSIST_POSTCONDITION',
    )
    return after
  }
  const wait = async (state, count, candidate, restored = false, oldTasks = new Set()) => {
    // Two consecutive complete observations; a saved value or queued deploy is
    // never sufficient. Any API/inspect error fails immediately, without retry.
    let stable = 0
    for (let attempt = 0; attempt < 60; attempt++) {
      const current = await read()
      check(
        current.env === state.env && current.composeFile === state.composeFile,
        'CONTROL_PLANE_DRIFT',
      )
      const { services, tasks } = await io.runtime()
      if (
        runtimeReady(
          services,
          tasks,
          count,
          candidate ? image : undefined,
          config.sha,
          restored,
          oldTasks,
        )
      ) {
        if (++stable === 2) return
      } else stable = 0
      await io.sleep()
    }
    throw new Error('WRITER_CONVERGENCE_TIMEOUT')
  }
  if (mode === 'fence') {
    const before = await read()
    // Validate the CURRENT saved compose with both values before touching it.
    // Do not replace its networks, images, storage settings or other services.
    await io.validateCompose(before)
    const fenced = await persist(before, 0)
    await io.deploy()
    await wait(fenced, 0, false)
  } else if (mode === 'verify-zero') {
    const state = await read()
    check(state.env === replicas(state.env, 0), 'FENCE_NOT_PERSISTED')
    await wait(state, 0, false)
  } else if (mode === 'restore') {
    const state = await read()
    check(state.env === replicas(state.env, 0), 'CANDIDATE_NOT_FENCED')
    // Verify what the NEXT deploy would start, not just the current Swarm spec.
    // A stale saved IMAGE must never restart old writers after migration.
    await io.validateCompose(state, image, config.sha)
    // The separate candidate deployment must have installed the immutable
    // candidate specs with zero writers before we may restore replicas.
    await wait(state, 0, true)
    const oldTasks = new Set((await io.runtime()).tasks.map((task) => task.ID))
    const restored = await persist(state, 1)
    await io.deploy()
    await wait(restored, 1, true, true, oldTasks)
  } else throw new Error('FENCE_MODE_INVALID')
}

function liveIO() {
  const helper = join(dirname(fileURLToPath(import.meta.url)), 'dokploy-curl.sh')
  const exec = (file, args, input) =>
    execFileSync(file, args, {
      input,
      encoding: 'utf8',
      timeout: 70000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  const api = (endpoint, payload) => {
    const origin = process.env.DOKPLOY_URL
    const resolve = process.env.DOKPLOY_CURL_RESOLVE
    check(/^https:\/\/[^/?#]+$/.test(origin ?? '') && resolve, 'CONTROL_PLANE_CONFIG_MISSING')
    const args = [
      '-sS',
      '--fail',
      '--connect-timeout',
      '5',
      '--max-time',
      '60',
      '--noproxy',
      resolve.split(':')[0],
      '--resolve',
      resolve,
    ]
    if (payload) args.push('-X', 'POST', '-H', 'content-type: application/json', '--data', '@-')
    else args.push('-G', '--data-urlencode', `composeId=${composeId}`)
    const result = exec(
      'bash',
      [helper, ...args, `${origin}/api/${endpoint}`],
      payload && JSON.stringify(payload),
    )
    return endpoint === 'compose.one' ? JSON.parse(result) : undefined
  }
  return {
    get: () => api('compose.one'),
    update: (payload) => api('compose.update', payload),
    deploy: () => api('compose.deploy', { composeId }),
    sleep: () => new Promise((resolve) => setTimeout(resolve, 5000)),
    runtime: () => {
      const services = JSON.parse(
        exec('docker', ['service', 'inspect', ...writers.map((r) => `${stack}_${r}`)]),
      )
      const ids = [
        ...new Set(
          writers.flatMap((role) =>
            exec('docker', ['service', 'ps', '--no-trunc', '-q', `${stack}_${role}`])
              .trim()
              .split(/\s+/)
              .filter(Boolean),
          ),
        ),
      ]
      const tasks = ids.length ? JSON.parse(exec('docker', ['inspect', ...ids])) : []
      for (const task of tasks) {
        if (
          task.Status?.State === 'running' &&
          services.some(
            (service) =>
              service.ID === task.ServiceID && service.Spec.Name !== `${stack}_scheduler`,
          )
        ) {
          const cid = task.Status.ContainerStatus?.ContainerID
          check(cid, 'WRITER_CONTAINER_MISSING')
          const containers = JSON.parse(exec('docker', ['inspect', cid]))
          task.health = containers[0]?.State?.Health?.Status
        }
      }
      return { services, tasks }
    },
    validateCompose: (state, expectedImage, expectedSha) => {
      const dir = mkdtempSync(join(tmpdir(), 'dev-writer-fence-'))
      try {
        const file = join(dir, 'compose.yaml'),
          envFile = join(dir, 'compose.env')
        writeFileSync(file, state.composeFile, { mode: 0o600 })
        const configs = [0, 1].map((count) => {
          writeFileSync(envFile, replicas(state.env, count), { mode: 0o600 })
          const cleanEnv = { PATH: process.env.PATH, HOME: process.env.HOME }
          const result = execFileSync(
            'docker',
            ['compose', '--env-file', envFile, '-f', file, 'config', '--format', 'json'],
            {
              env: cleanEnv,
              encoding: 'utf8',
              timeout: 30000,
              maxBuffer: 16 * 1024 * 1024,
              stdio: ['pipe', 'pipe', 'pipe'],
            },
          )
          const config = JSON.parse(result)
          check(
            JSON.stringify(Object.keys(config.services ?? {}).sort()) ===
              JSON.stringify(['collabora', 'scheduler', 'storage-init', 'web', 'worker']),
            'COMPOSE_SERVICE_SET_AMBIGUOUS',
          )
          for (const role of writers) {
            check(
              config.services?.[role]?.deploy?.replicas === count,
              'COMPOSE_WRITER_NOT_FENCEABLE',
            )
            if (expectedImage) {
              check(
                config.services[role].image === expectedImage &&
                  config.services[role].environment?.APP_VERSION === expectedSha &&
                  config.services[role].environment?.APP_ROLE === role,
                'SAVED_CANDIDATE_IDENTITY_MISMATCH',
              )
            }
            config.services[role].deploy.replicas = 0
          }
          return config
        })
        check(
          JSON.stringify(configs[0]) === JSON.stringify(configs[1]),
          'COMPOSE_FENCE_CHANGES_NONWRITERS',
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFence(process.argv[2], liveIO(), {
    verified: process.env.FEATURE_CANDIDATE_VERIFIED,
    mode: process.env.DOKPLOY_DEPLOY_MODE,
    stack: process.env.DOKPLOY_TARGET_STACK,
    composeId: process.env.DOKPLOY_COMPOSE_ID,
    host: process.env.EXPECTED_APP_HOST,
    sha: process.env.DEPLOY_SOURCE_SHA,
    digest: process.env.IMAGE_DIGEST,
  })
    .then(() => console.log(`DEV writer ${process.argv[2]} verified`))
    .catch((error) => {
      // Child-process errors can contain API bodies or Compose secrets. Emit only
      // our allowlisted symbolic errors; never stringify the caught exception.
      const code = /^[A-Z_]+$/.test(error.message)
        ? error.message
        : 'CONTROL_PLANE_OR_RUNTIME_FAILURE'
      console.error(
        `::error::DEV writer fence failed [${code}]. No automatic writer recovery is attempted.`,
      )
      process.exitCode = 1
    })
}

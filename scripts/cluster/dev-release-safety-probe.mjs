import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const [sourceSha, phase, check] = process.argv.slice(2)
const stack = 'uvanoo-v1-4-dev-gniriv'
const roles = ['web', 'worker', 'scheduler', 'storage-init']
const terminal = new Set(['complete', 'shutdown', 'failed', 'rejected', 'remove'])
const digest = (value) => createHash('sha256').update(value).digest('hex')
const stable = (value) =>
  Array.isArray(value)
    ? '[' + value.map(stable).join(',') + ']'
    : value && typeof value === 'object'
      ? '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + stable(v)).join(',') + '}'
      : JSON.stringify(value)

function fail() {
  process.exitCode = 1
}
function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 })
}
function emit(facts) {
  process.stdout.write(JSON.stringify({
    version: 1,
    target: {
      repository: 'Satho82/beaconhs',
      environment: 'dev',
      composeId: 'wYb0LxLQrvj2FPI21i-Oj',
      stack,
      host: 'dev.uvanoo.com',
      database: 'uvanoo_dev',
      databaseHost: 'uvanoo-dev-postgres',
      network: 'uvanoo-dev-private',
    },
    sourceSha,
    phase,
    check,
    observedAt: new Date().toISOString(),
    facts,
  }))
}
try {
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || !['migration', 'web'].includes(phase)) throw new Error()
  if (check !== 'persistentFourZero') throw new Error()
  const services = JSON.parse(docker(['service', 'inspect', ...roles.map((role) => stack + '_' + role)]))
  if (!Array.isArray(services) || services.length !== roles.length) throw new Error()
  const identities = []
  const transitions = []
  for (const role of roles) {
    const service = services.find((item) => item?.Spec?.Name === stack + '_' + role)
    if (!service?.ID || service.Spec?.Mode?.Replicated?.Replicas !== 0) throw new Error()
    const ids = docker(['service', 'ps', '--no-trunc', '-q', stack + '_' + role]).trim().split(/\s+/).filter(Boolean)
    const tasks = ids.length ? JSON.parse(docker(['inspect', ...ids])) : []
    if (tasks.some((task) => !terminal.has(task?.Status?.State))) throw new Error()
    identities.push({ role, id: service.ID })
    transitions.push({ role, replicas: service.Spec.Mode.Replicated.Replicas, image: service.Spec.TaskTemplate?.ContainerSpec?.Image ?? '' })
  }
  emit({
    exactFourServiceIdentities: true,
    desiredReplicas: 0,
    activeTasks: 0,
    approvedServiceIdsSha256: digest(stable(identities)),
    approvedSpecTransitionSha256: digest(stable(transitions)),
  })
} catch {
  fail()
}

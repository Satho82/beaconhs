// Offline only. Read protected JSON from stdin; never connect, deploy or print
// values/digests of credentials. Caller supplies observations in memory, not a
// checked-in fixture. Authentication remains a separate live read-only gate.
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import { posix } from 'node:path'
import { writers, zero } from './dev-writer-fence.mjs'

const check = (ok, code) => {
  if (!ok) throw new Error(code)
}
const connectionNames = ['DATABASE_URL', 'SUPERADMIN_DATABASE_URL', 'REDIS_URL']
const storageNames = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
const required = (value) => typeof value === 'string' && value.length > 0
function connection(value) {
  check(required(value), 'CONNECTION_MISSING')
  try {
    return new URL(value)
  } catch {
    throw new Error('CONNECTION_INVALID')
  }
}
function correctConnection(name, value) {
  const u = connection(value)
  check(required(u.password), 'CREDENTIAL_IDENTITY_MISSING')
  if (name === 'REDIS_URL') {
    check(
      u.protocol === 'redis:' &&
        u.hostname === 'uvanoo-dev-redis' &&
        (u.port || '6379') === '6379' &&
        u.pathname === '/0',
      'REDIS_TARGET_MISMATCH',
    )
  } else {
    check(required(u.username), 'CREDENTIAL_IDENTITY_MISSING')
    check(
      ['postgres:', 'postgresql:'].includes(u.protocol) &&
        u.hostname === 'uvanoo-dev-postgres' &&
        (u.port || '5432') === '5432' &&
        u.pathname === '/beaconhs',
      'POSTGRES_TARGET_MISMATCH',
    )
    check(
      decodeURIComponent(u.username) ===
        (name === 'DATABASE_URL' ? 'beaconhs_app' : 'beaconhs_super'),
      'POSTGRES_ROLE_MISMATCH',
    )
  }
  check(!u.hash, 'CONNECTION_FRAGMENT_FORBIDDEN')
  // libpq endpoint overrides can silently defeat the visible host/database.
  const allowed = new Set([
    'sslmode',
    'sslrootcert',
    'sslcert',
    'sslkey',
    'connect_timeout',
    'application_name',
    'channel_binding',
  ])
  for (const [key] of u.searchParams) check(allowed.has(key), 'CONNECTION_OPTION_REVIEW_REQUIRED')
  return u
}
export function configurationComparison(before, after, permanent) {
  check(before && after && permanent, 'CONFIGURATION_MISSING')
  const baseline = structuredClone(before),
    proposed = structuredClone(after),
    report = []
  for (const config of [baseline, proposed])
    check(
      isDeepStrictEqual(Object.keys(config.services ?? {}).sort(), [...writers].sort()),
      'FIVE_SERVICES_REQUIRED',
    )
  for (const role of writers) {
    const old = baseline.services[role],
      next = proposed.services[role]
    check(
      /@sha256:[0-9a-f]{64}$/.test(next.image ?? '') && old.image === next.image,
      'PINNED_IMAGE_CHANGED',
    )
    check(next.deploy?.replicas === zero[role], 'PREFLIGHT_REQUIRES_FULL_FENCE')
    check(old.deploy && Number.isInteger(old.deploy.replicas), 'BASELINE_REPLICAS_MISSING')
    old.deploy.replicas = 0
    const needed =
      role === 'scheduler'
        ? ['DATABASE_URL', 'REDIS_URL']
        : ['web', 'worker'].includes(role)
          ? connectionNames
          : []
    for (const name of needed) {
      const oldURL = connection(old.environment?.[name]),
        u = correctConnection(name, next.environment?.[name])
      const source = correctConnection(name, permanent[name])
      const credentialMatch = u.username === source.username && u.password === source.password
      check(credentialMatch, 'PERMANENT_CREDENTIAL_IDENTITY_MISMATCH')
      check(u.search === oldURL.search && u.search === source.search, 'CONNECTION_OPTIONS_CHANGED')
      report.push({
        service: role,
        variable: name,
        changed: old.environment[name] !== next.environment[name],
        credentialIdentityMatches: true,
        optionsPreserved: true,
      })
      old.environment[name] = next.environment[name]
    }
    if (['web', 'worker', 'storage-init'].includes(role)) {
      for (const name of storageNames) {
        check(
          required(permanent[name]) && next.environment?.[name] === permanent[name],
          'STORAGE_CREDENTIAL_IDENTITY_MISMATCH',
        )
        report.push({
          service: role,
          variable: name,
          changed: old.environment?.[name] !== next.environment[name],
          credentialIdentityMatches: true,
        })
        old.environment[name] = next.environment[name]
      }
      const endpoint = connection(next.environment.R2_ENDPOINT)
      check(
        endpoint.protocol === 'http:' &&
          endpoint.hostname === 'uvanoo-dev-minio' &&
          endpoint.port === '9000' &&
          endpoint.pathname === '/' &&
          !endpoint.username &&
          !endpoint.password &&
          !endpoint.search &&
          !endpoint.hash,
        'STORAGE_ENDPOINT_MISMATCH',
      )
      for (const name of ['R2_ENDPOINT', 'R2_BUCKET'])
        check(
          required(permanent[name]) && next.environment[name] === permanent[name],
          'STORAGE_SELECTION_MISMATCH',
        )
    }
  }
  // No image, command, healthcheck, network, domain, mount, bucket, security or
  // arbitrary environment change can hide behind a connection correction.
  check(isDeepStrictEqual(baseline, proposed), 'UNAPPROVED_RENDERED_DIFFERENCE')
  return {
    status: 'PASS',
    differences: report,
    authentication: 'REQUIRES_SEPARATE_READ_ONLY_PROOF',
  }
}

export function runtimeComparison(rendered, services) {
  check(
    Array.isArray(services) && services.length === writers.length,
    'RUNTIME_SERVICE_SET_INVALID',
  )
  check(
    isDeepStrictEqual(Object.keys(rendered?.services ?? {}).sort(), [...writers].sort()),
    'FIVE_SERVICES_REQUIRED',
  )
  for (const role of writers) {
    const matches = services.filter(
      (service) => service.Spec?.Name === `uvanoo-v1-4-dev-gniriv_${role}`,
    )
    check(matches.length === 1, 'RUNTIME_SERVICE_IDENTITY_INVALID')
    const service = matches[0],
      spec = service.Spec.TaskTemplate?.ContainerSpec,
      expected = rendered.services[role]
    check(spec && spec.Image === expected.image, 'RUNTIME_IMAGE_DRIFT')
    check(
      service.Spec.Mode?.Replicated?.Replicas === expected.deploy?.replicas,
      'RUNTIME_REPLICA_DRIFT',
    )
    const actualEnv = {}
    check(Array.isArray(spec.Env), 'RUNTIME_ENV_MISSING')
    for (const entry of spec.Env) {
      check(typeof entry === 'string' && entry.indexOf('=') > 0, 'RUNTIME_ENV_INVALID')
      const at = entry.indexOf('='),
        name = entry.slice(0, at)
      check(!Object.hasOwn(actualEnv, name), 'RUNTIME_ENV_AMBIGUOUS')
      Object.defineProperty(actualEnv, name, { value: entry.slice(at + 1), enumerable: true })
    }
    check(isDeepStrictEqual(actualEnv, expected.environment), 'RUNTIME_ENV_DRIFT')
  }
  return {
    status: 'PASS',
    imageReplicaEnvironmentParity: true,
    mountNetworkLabelParity: 'SEPARATE_SPEC_PROOF_REQUIRED',
  }
}

export function storageContract({ volume, legacyMounts, existingMounts, compose }) {
  check(
    volume?.Name === 'uvanoo-dev-minio-data' &&
      volume.Driver === 'local' &&
      required(volume.Mountpoint),
    'RETAINED_VOLUME_NOT_VERIFIED',
  )
  check(
    !volume.Options || Object.keys(volume.Options).length === 0,
    'VOLUME_DRIVER_OPTIONS_REQUIRE_REVIEW',
  )
  const devPath = posix.normalize(volume.Mountpoint)
  check(posix.isAbsolute(devPath) && devPath !== '/', 'VOLUME_PATH_INVALID')
  check(
    Array.isArray(legacyMounts) && legacyMounts.length > 0 && Array.isArray(existingMounts),
    'STORAGE_OBSERVATIONS_MISSING',
  )
  for (const mount of legacyMounts) {
    check(required(mount.Source) && posix.isAbsolute(mount.Source), 'LEGACY_STORAGE_PATH_MISSING')
    const path = posix.normalize(mount.Source)
    check(
      path !== devPath && !path.startsWith(devPath + '/') && !devPath.startsWith(path + '/'),
      'LEGACY_STORAGE_OVERLAP',
    )
  }
  check(existingMounts.length === 0, 'RETAINED_VOLUME_ALREADY_IN_USE')
  const declaration = compose?.volumes?.['uvanoo-dev-minio-data']
  check(
    declaration?.external === true && declaration.name === volume.Name,
    'EXTERNAL_EXISTING_VOLUME_REQUIRED',
  )
  check(Object.keys(compose.services ?? {}).join() === 'minio', 'MINIO_SERVICE_SET_INVALID')
  const minio = compose.services.minio
  check(
    minio.image ===
      'minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e',
    'MINIO_IMAGE_CHANGED',
  )
  check(
    minio.container_name === 'uvanoo-dev-minio' &&
      !minio.ports?.length &&
      !minio.privileged &&
      !minio.network_mode,
    'MINIO_EXPOSURE_INVALID',
  )
  check(
    minio.volumes?.length === 1 &&
      minio.volumes[0].type === 'volume' &&
      minio.volumes[0].source === volume.Name &&
      minio.volumes[0].target === '/data' &&
      minio.volumes[0].volume?.nocopy === true,
    'MINIO_MOUNT_INVALID',
  )
  check(
    Object.keys(compose.networks ?? {})
      .sort()
      .join() === 'uvanoo-dev-private,uvanoo-dev-runtime' &&
      Object.entries(compose.networks).every(
        ([name, net]) => net.external === true && net.name === name,
      ),
    'MINIO_NETWORKS_INVALID',
  )
  check(
    Object.keys(minio.networks ?? {})
      .sort()
      .join() === 'uvanoo-dev-private,uvanoo-dev-runtime',
    'MINIO_SERVICE_NETWORKS_INVALID',
  )
  check(
    isDeepStrictEqual(minio.command, ['server', '/data', '--console-address', ':9001']) &&
      minio.restart === 'no',
    'MINIO_STARTUP_DRIFT',
  )
  return {
    status: 'PASS',
    existingVolumeMapping: true,
    observedPathIsolation: true,
    objectCompleteness: 'UNKNOWN',
    filesystemAliasIsolation: 'OWNER_REALPATH_MOUNT_PROOF_REQUIRED',
    storageAuthentication: 'UNKNOWN',
    executionAuthorized: false,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'))
    const result =
      process.argv[2] === 'configuration'
        ? configurationComparison(input.before, input.after, input.permanent)
        : process.argv[2] === 'runtime'
          ? runtimeComparison(input.rendered, input.services)
          : process.argv[2] === 'storage'
            ? storageContract(input)
            : null
    check(result, 'PREFLIGHT_MODE_INVALID')
    console.log(JSON.stringify(result))
  } catch (error) {
    console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'PREFLIGHT_INPUT_INVALID')
    process.exitCode = 1
  }
}

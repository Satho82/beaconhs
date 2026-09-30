import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { hostname } from 'node:os'
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, statSync } from 'node:fs'

// Operator CLI only: never import this file from application runtime code.
const root = '/opt/uvanoo-dev'
const source = `${root}/source`
function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
let temporary
try {
  if (
    hostname() !== 'vps-c54e0b88' ||
    process.platform !== 'linux' ||
    process.env.UVANOO_ENVIRONMENT !== 'development' ||
    process.env.UVANOO_FIRST_IDENTITY_CONFIRM !== 'CREATE_FIRST_DEV_IDENTITY'
  )
    throw new Error('guard')
  const image = process.env.UVANOO_VALIDATED_IMAGE ?? ''
  const revision = process.env.UVANOO_VALIDATED_SHA ?? ''
  if (
    !/^ghcr\.io\/satho82\/uvanoo-staging-private@sha256:[a-f0-9]{64}$/.test(image) ||
    !/^[a-f0-9]{40}$/.test(revision) ||
    run('git', ['-C', source, 'rev-parse', 'HEAD']) !== revision ||
    run('git', ['-C', source, 'status', '--porcelain']) !== ''
  )
    throw new Error('source')
  const [localImage] = JSON.parse(run('docker', ['image', 'inspect', image]))
  if (localImage.Config.Labels['org.opencontainers.image.revision'] !== revision)
    throw new Error('image')
  const [container] = JSON.parse(run('docker', ['inspect', 'uvanoo-dev-postgres']))
  const [network] = JSON.parse(run('docker', ['network', 'inspect', 'uvanoo-dev-private']))
  const attachment = container.NetworkSettings.Networks['uvanoo-dev-private']
  if (
    !container.State.Running ||
    container.Name !== '/uvanoo-dev-postgres' ||
    network.Name !== 'uvanoo-dev-private' ||
    !network.Internal ||
    !attachment ||
    attachment.NetworkID !== network.Id ||
    Object.keys(container.NetworkSettings.Networks).length !== 1 ||
    Object.keys(container.NetworkSettings.Ports ?? {}).some(
      (key) => container.NetworkSettings.Ports[key],
    )
  )
    throw new Error('target')
  if (run('docker', ['ps', '--filter', 'name=^/uvanoo-dev-web$', '--format', '{{.ID}}']))
    throw new Error('DEV writers must be stopped')
  const envStat = statSync(`${root}/.env`)
  if ((envStat.mode & 0o077) !== 0) throw new Error('secret permissions')
  const secretFile = `${root}/first-identity.secret.env`
  try {
    writeFileSync(
      secretFile,
      `UVANOO_FIRST_IDENTITY_PASSWORD=${randomBytes(36).toString('base64url')}\n`,
      { flag: 'wx', mode: 0o600 },
    )
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  if (
    (statSync(secretFile).mode & 0o077) !== 0 ||
    !/^UVANOO_FIRST_IDENTITY_PASSWORD=[A-Za-z0-9_-]{48}\n$/.test(readFileSync(secretFile, 'utf8'))
  )
    throw new Error('secret permissions or format')
  temporary = mkdtempSync(`${root}/.first-identity-`)
  chmodSync(temporary, 0o755)
  writeFileSync(
    `${temporary}/target.json`,
    JSON.stringify({
      host: hostname(),
      container: 'uvanoo-dev-postgres',
      network: network.Name,
      containerId: container.Id,
      networkId: network.Id,
      address: attachment.IPAddress,
    }),
    { mode: 0o444 },
  )
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--name',
      'uvanoo-dev-first-identity',
      '--network',
      'uvanoo-dev-private',
      '--memory',
      '384m',
      '--cpus',
      '0.5',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=32m',
      '--env-file',
      `${root}/.env`,
      '--env-file',
      secretFile,
      '-e',
      'NODE_ENV=development',
      '-e',
      'UVANOO_ENVIRONMENT=development',
      '-e',
      'UVANOO_FIRST_IDENTITY_CONFIRM=CREATE_FIRST_DEV_IDENTITY',
      '-e',
      'UVANOO_FIRST_IDENTITY_EMAIL=dev.admin@uvanoo.invalid',
      '-v',
      `${source}:/app:ro`,
      '-v',
      `${temporary}/target.json:/run/uvanoo-dev-target.json:ro`,
      '-w',
      '/app/apps/web',
      '--entrypoint',
      '/bin/sh',
      image,
      '-c',
      './node_modules/.bin/tsx scripts/dev-first-identity.ts',
    ],
    { stdio: 'inherit' },
  )
} catch {
  console.error('DEV first-identity launcher refused or failed; no credentials logged')
  process.exitCode = 1
} finally {
  if (temporary?.startsWith(`${root}/.first-identity-`)) rmSync(temporary, { recursive: true })
}

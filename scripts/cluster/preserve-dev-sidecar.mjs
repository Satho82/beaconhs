import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'

const required = ['APP_URL', 'COLLABORA_IMAGE', 'COLLABORA_SERVER_NAME']
const assert = (ok, message) => {
  if (!ok) throw new Error(message)
}
function getValue(env, key) {
  const lines = env.split('\n').filter((line) => line.startsWith(key + '='))
  assert(lines.length === 1 && !lines[0].includes('\r'), 'SIDECAR_ENV_INVALID')
  return lines[0].slice(key.length + 1)
}
function sidecarBlock(text) {
  assert(!text.includes('\r') && !text.includes('\t'), 'COMPOSE_FORMAT_INVALID')
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line === '  collabora:')
  assert(
    start >= 0 && lines.filter((line) => line === '  collabora:').length === 1,
    'SIDECAR_AMBIGUOUS',
  )
  let end = start + 1
  while (end < lines.length && !/^(?:  [a-zA-Z0-9_-]+:|[a-zA-Z0-9_-]+:)/.test(lines[end])) end++
  const block = lines.slice(start, end).join('\n').trimEnd() + '\n'
  assert(!/\b(?:configs|secrets|depends_on):/.test(block), 'SIDECAR_DEPENDENCY_UNSUPPORTED')
  assert(!/(^|\s)[&*][a-zA-Z0-9_-]+/m.test(block), 'SIDECAR_ANCHOR_UNSUPPORTED')
  const vars = [...block.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)[^}]*\}/g)].map((m) => m[1])
  assert(
    vars.length > 0 && vars.every((name) => required.includes(name)),
    'SIDECAR_VARIABLE_UNSUPPORTED',
  )
  assert(!/\$[A-Za-z_]/.test(block.replace(/\$\{[^}]+\}/g, '')), 'SIDECAR_VARIABLE_UNSUPPORTED')
  return block
}
export function preserveSidecar(saved, template, newEnv, render) {
  assert(
    saved && typeof saved.composeFile === 'string' && typeof saved.env === 'string',
    'SAVED_STATE_INVALID',
  )
  assert(
    saved.composeId === 'wYb0LxLQrvj2FPI21i-Oj' &&
      saved.sourceType === 'raw' &&
      saved.composeType === 'stack' &&
      saved.autoDeploy === false &&
      saved.serverId === null,
    'TARGET_INVALID',
  )
  const block = sidecarBlock(saved.composeFile)
  assert(!/^  collabora:\s*$/m.test(template), 'CANDIDATE_SIDECAR_ALREADY_PRESENT')
  assert((template.match(/^networks:\s*$/gm) || []).length === 1, 'CANDIDATE_NETWORKS_INVALID')
  let env = newEnv
  for (const key of required) {
    const old = getValue(saved.env, key)
    assert(old !== '', 'SIDECAR_ENV_INVALID')
    if (key === 'APP_URL') assert(getValue(env, key) === old, 'SIDECAR_APP_URL_DRIFT')
    else {
      assert(!env.split('\n').some((line) => line.startsWith(key + '=')), 'SIDECAR_ENV_DUPLICATE')
      env += (env.endsWith('\n') ? '' : '\n') + key + '=' + old + '\n'
    }
  }
  // Dedicated telemetry settings are hashes/bindings, never an interactive session.
  const observerKeys = [
    'UVANOO_WOPI_OBSERVER_SHA256',
    'UVANOO_WOPI_OBSERVER_EXPIRES_AT',
    'UVANOO_WOPI_RECOVERY_EPOCH',
    'UVANOO_RECOVERY_COMPOSE_ID',
  ]
  if (
    observerKeys.some((key) => saved.env.split('\n').some((line) => line.startsWith(key + '=')))
  ) {
    const values = Object.fromEntries(observerKeys.map((key) => [key, getValue(saved.env, key)]))
    assert(
      /^[a-f0-9]{64}$/.test(values.UVANOO_WOPI_OBSERVER_SHA256) &&
        /^[a-f0-9]{64}$/.test(values.UVANOO_WOPI_RECOVERY_EPOCH) &&
        values.UVANOO_RECOVERY_COMPOSE_ID === 'wYb0LxLQrvj2FPI21i-Oj' &&
        Number.isFinite(Date.parse(values.UVANOO_WOPI_OBSERVER_EXPIRES_AT)) &&
        Date.parse(values.UVANOO_WOPI_OBSERVER_EXPIRES_AT) > Date.now() &&
        getValue(env, 'APP_URL') === 'https://dev.uvanoo.com' &&
        /^[a-f0-9]{40}$/.test(getValue(env, 'APP_VERSION')),
      'OBSERVER_BINDING_INVALID',
    )
    for (const key of [...observerKeys, 'UVANOO_RECOVERY_SOURCE_SHA']) {
      assert(!env.split('\n').some((line) => line.startsWith(key + '=')), 'OBSERVER_ENV_DUPLICATE')
    }
    env +=
      (env.endsWith('\n') ? '' : '\n') +
      observerKeys.map((key) => key + '=' + values[key]).join('\n') +
      '\n' +
      'UVANOO_RECOVERY_SOURCE_SHA=' +
      getValue(env, 'APP_VERSION') +
      '\n'
  }
  const compose = template.replace(/^networks:\s*$/m, block + '\nnetworks:')
  const oldSidecar = render(saved.composeFile, saved.env).services?.collabora
  const newSidecar = render(compose, env).services?.collabora
  assert(oldSidecar?.deploy?.replicas === 0, 'SIDECAR_NOT_FENCED')
  assert(
    oldSidecar && newSidecar && isDeepStrictEqual(oldSidecar, newSidecar),
    'SIDECAR_RENDER_DRIFT',
  )
  return { compose, env }
}
function renderCompose(compose, env) {
  const dir = mkdtempSync(join(tmpdir(), 'uvanoo-sidecar-'))
  try {
    const file = join(dir, 'compose.yaml'),
      envFile = join(dir, 'compose.env')
    writeFileSync(file, compose, { mode: 0o600 })
    writeFileSync(envFile, env, { mode: 0o600 })
    const result = execFileSync(
      'docker',
      ['compose', '--env-file', envFile, '-f', file, 'config', '--format', 'json'],
      {
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    return JSON.parse(result)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
if (process.argv[1]?.endsWith('/preserve-dev-sidecar.mjs')) {
  try {
    const [statePath, templatePath, envPath, outputPath] = process.argv.slice(2)
    assert(statePath && templatePath && envPath && outputPath, 'INPUT_REQUIRED')
    const saved = JSON.parse(readFileSync(statePath, 'utf8'))
    const result = preserveSidecar(
      saved,
      readFileSync(templatePath, 'utf8'),
      readFileSync(envPath, 'utf8'),
      renderCompose,
    )
    writeFileSync(outputPath, result.compose, { mode: 0o600 })
    writeFileSync(envPath, result.env, { mode: 0o600 })
    console.log('SIDECAR_RENDER_PARITY_OK')
  } catch {
    console.error('SIDECAR_PRESERVATION_FAILED')
    process.exitCode = 1
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { preserveSidecar } from './preserve-dev-sidecar.mjs'
const block =
  '  collabora:\n    image: ${COLLABORA_IMAGE}\n    environment:\n      server_name: ${COLLABORA_SERVER_NAME}\n      extra_params: ${APP_URL}\n    deploy:\n      replicas: 0\n    networks: [dokploy-network]\n    volumes: [/synthetic/branding.js:/branding.js:ro]\n'
const saved = {
  composeId: 'wYb0LxLQrvj2FPI21i-Oj',
  sourceType: 'raw',
  composeType: 'stack',
  autoDeploy: false,
  serverId: null,
  composeFile:
    'services:\n  web:\n    image: fake\n' +
    block +
    'networks:\n  dokploy-network:\n    external: true\n',
  env:
    'APP_URL=https://dev.example\nCOLLABORA_IMAGE=example@sha256:' +
    'a'.repeat(64) +
    '\nCOLLABORA_SERVER_NAME=dev.example\n',
}
const template =
  'services:\n  web:\n    image: fake\nnetworks:\n  dokploy-network:\n    external: true\n'
const env = 'APP_URL=https://dev.example\n'
const render = (compose, e) => ({
  services: {
    collabora: {
      deploy: { replicas: 0 },
      block: compose
        .slice(compose.indexOf('  collabora:'), compose.indexOf('networks:\n  dokploy-network:'))
        .trim(),
      env: e
        .split('\n')
        .filter((x) => /^(APP_URL|COLLABORA_IMAGE|COLLABORA_SERVER_NAME)=/.test(x))
        .sort(),
    },
  },
})
test('preserves exact sidecar and private variables', () => {
  const r = preserveSidecar(saved, template, env, render)
  assert.ok(r.compose.includes(block))
  assert.ok(r.env.includes('COLLABORA_IMAGE='))
})
test('rejects wrong target', () =>
  assert.throws(() => preserveSidecar({ ...saved, composeId: 'wrong' }, template, env, render)))
test('rejects changed application URL', () =>
  assert.throws(() => preserveSidecar(saved, template, 'APP_URL=https://other\n', render)))
test('rejects duplicate private variables', () =>
  assert.throws(() => preserveSidecar(saved, template, env + 'COLLABORA_IMAGE=bad\n', render)))
test('rejects missing sidecar', () =>
  assert.throws(() => preserveSidecar({ ...saved, composeFile: template }, template, env, render)))
test('rejects unsupported sidecar variable', () =>
  assert.throws(() =>
    preserveSidecar(
      { ...saved, composeFile: saved.composeFile.replace('${APP_URL}', '${PRIVATE_TOKEN}') },
      template,
      env,
      render,
    ),
  ))
test('rejects semantic sidecar drift', () => {
  let n = 0
  assert.throws(() =>
    preserveSidecar(saved, template, env, () => ({ services: { collabora: { value: n++ } } })),
  )
})
test('rejects unsupported sidecar dependencies', () =>
  assert.throws(() =>
    preserveSidecar(
      {
        ...saved,
        composeFile: saved.composeFile.replace(
          '    networks:',
          '    secrets: [unknown]\n    networks:',
        ),
      },
      template,
      env,
      render,
    ),
  ))

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
test('actual docker compose renderer preserves complete sidecar', () => {
  const d = mkdtempSync(join(tmpdir(), 'sidecar-integration-'))
  try {
    const paths = ['state.json', 'template.yaml', 'new.env', 'result.yaml'].map((x) => join(d, x))
    writeFileSync(paths[0], JSON.stringify(saved))
    writeFileSync(paths[1], template)
    writeFileSync(paths[2], env)
    const result = spawnSync('node', ['scripts/cluster/preserve-dev-sidecar.mjs', ...paths], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.ok(readFileSync(paths[3], 'utf8').includes(block))
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test('rejects active Collabora sidecar', () => {
  assert.throws(() =>
    preserveSidecar(saved, template, env, () => ({
      services: { collabora: { deploy: { replicas: 1 } } },
    })),
  )
})

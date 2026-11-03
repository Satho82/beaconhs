import { classifyPath, parseChanges } from '../../ci/v1.4-fast-dev-plan.mjs'

export const TARGET = Object.freeze({
  repository: 'Satho82/beaconhs',
  origin: 'https://dev.uvanoo.com',
  stack: 'uvanoo-v1-4-dev-gniriv',
  composeId: 'wYb0LxLQrvj2FPI21i-Oj',
  environmentId: 'qT391QtcIqahNap5wPjif',
  image: 'ghcr.io/satho82/uvanoo-staging-private',
})
export function requireValue(ok, code) {
  if (!ok) throw new Error(code)
}
export function plan(base, sha, changes, ancestor) {
  requireValue(/^[a-f0-9]{40}$/.test(base) && /^[a-f0-9]{40}$/.test(sha), 'INVALID_SOURCE')
  const paths = parseChanges(changes).flatMap((change) => change.paths)
  const categories = [...new Set(paths.flatMap(classifyPath))].sort()
  const sensitive = paths.some((p) =>
    /(?:auth|permission|tenant|wopi|collabora|recovery|migration|schema|middleware|proxy|instrumentation|security)/i.test(
      p,
    ),
  )
  const applicationPathsOnly = paths.every(
    (p) =>
      /^(?:apps\/web\/(?:src|public)\/|packages\/ui\/src\/|docs\/(?:screenshots|user-guide)\/)/.test(
        p,
      ) || p === 'README.md',
  )
  const routine =
    ancestor &&
    applicationPathsOnly &&
    !sensitive &&
    categories.every((c) => ['WEB LOGIC', 'UI PRESENTATION', 'SHARED UI', 'DOCS ONLY'].includes(c))
  return {
    base,
    sha,
    mode: routine ? 'fast' : 'controlled',
    paths,
    categories,
    databaseRestoreRequired: !routine,
    reason: routine
      ? 'Application-only diff; schema and infrastructure unchanged'
      : 'Sensitive, shared, infrastructure or unknown change requires controlled admission',
  }
}
export function patchEnv(env, values) {
  let result = env
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=.*$`, 'gm')
    requireValue(
      (result.match(pattern) ?? []).length === 1 && !/[\r\n]/.test(value),
      'ENV_IDENTITY_AMBIGUOUS',
    )
    result = result.replace(pattern, () => `${key}=${value}`)
  }
  return result
}
export async function persistConfiguration(io, from, to) {
  const current = await io.compose()
  const image = (digest) => `${TARGET.image}@${digest}`
  const wanted = patchEnv(to.env, { IMAGE: image(to.digest), APP_VERSION: to.sha })
  const expected = patchEnv(from.env, { IMAGE: image(from.digest), APP_VERSION: from.sha })
  requireValue(
    current.composeFile === from.composeFile && [expected, wanted].includes(current.env),
    'CONFIG_DRIFT_DO_NOT_OVERWRITE',
  )
  await io.api('saveEnvironment', { composeId: TARGET.composeId, env: wanted })
  const saved = await io.compose()
  requireValue(
    saved.env === wanted && saved.composeFile === from.composeFile,
    'CONFIG_PERSISTENCE_FAILED',
  )
}
export async function release(io, request) {
  requireValue(request.repository === TARGET.repository, 'WRONG_REPOSITORY')
  requireValue(
    /^[a-f0-9]{40}$/.test(request.sha) && /^sha256:[a-f0-9]{64}$/.test(request.digest),
    'INVALID_CANDIDATE',
  )
  // This executor has no migration, deletion, worker activation or production operation.
  const before = await io.snapshot()
  const diff = await io.diff(before.sha, request.sha)
  const impact = plan(before.sha, request.sha, diff.changes, diff.ancestor)
  await io.verifyCI(request.sha)
  await io.verifyImage(request.sha, request.digest)
  await io.preflight(before)
  await io.record('plan', {
    ...impact,
    digest: request.digest,
    previousDigest: before.digest,
    dryRun: !request.execute,
  })
  if (!request.execute) return { status: 'DRY_RUN', ...impact }
  requireValue(
    request.enabled && request.authorized && request.compatible,
    'OWNER_ENABLEMENT_AND_COMPATIBILITY_REQUIRED',
  )
  requireValue(impact.mode === 'fast', 'CONTROLLED_ADMISSION_REQUIRED')
  await io.verifyImage(before.sha, before.digest)
  // Smoke before mutation catches missing credentials and existing failures, avoiding false rollback.
  await io.smoke(before.sha, false)
  await io.assertUnchanged(before)
  const next = { ...before, sha: request.sha, digest: request.digest }
  let attempted = false
  try {
    attempted = true
    await io.persist(before, next)
    await io.rollout(next)
    await io.ready(next)
    await io.smoke(next.sha, true)
    await io.checkPaused()
    await io.record('verified', { sha: next.sha, digest: next.digest })
    return { status: 'VERIFIED', sha: next.sha, digest: next.digest }
  } catch {
    await io.record('activation-failed', { sha: request.sha, rollbackRequired: attempted })
    // Only FAST reaches here: no migrations, forward data transformation or job replay.
    try {
      await io.persist(next, before)
      await io.rollout(before)
      await io.ready(before)
      await io.smoke(before.sha, false)
      await io.checkPaused()
      await io.record('rollback-verified', { sha: before.sha, digest: before.digest })
    } catch {
      await io.record('rollback-incomplete', { sha: before.sha, manualRecoveryRequired: true })
      throw new Error('ROLLBACK_INCOMPLETE_OPERATOR_REQUIRED')
    }
    throw new Error('ACTIVATION_FAILED_ROLLBACK_VERIFIED')
  }
}

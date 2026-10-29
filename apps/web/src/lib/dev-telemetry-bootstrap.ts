/** Owner-authorised DEV bootstrap: no application UI or new editor admission. */
export function bootstrapRequestAllowed(
  method: string,
  pathname: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = Date.now(),
): boolean {
  if (env.UVANOO_DEV_TELEMETRY_BOOTSTRAP === undefined || env.UVANOO_DEV_TELEMETRY_BOOTSTRAP === '')
    return true
  const expires = Date.parse(env.UVANOO_DEV_TELEMETRY_BOOTSTRAP_EXPIRES_AT ?? '')
  if (
    env.UVANOO_DEV_TELEMETRY_BOOTSTRAP !== 'true' ||
    env.BETTER_AUTH_URL !== 'https://dev.uvanoo.com' ||
    env.UVANOO_RECOVERY_COMPOSE_ID !== 'wYb0LxLQrvj2FPI21i-Oj' ||
    !/^[a-f0-9]{40}$/.test(env.UVANOO_RECOVERY_SOURCE_SHA ?? '') ||
    env.APP_VERSION !== env.UVANOO_RECOVERY_SOURCE_SHA ||
    !/^[a-f0-9]{64}$/.test(env.UVANOO_WOPI_RECOVERY_EPOCH ?? '') ||
    !/^[a-f0-9]{64}$/.test(env.UVANOO_WOPI_OBSERVER_SHA256 ?? '') ||
    !Number.isFinite(expires) ||
    expires <= now ||
    expires - now > 2 * 3600_000
  )
    return false
  return (
    (method === 'GET' && ['/api/health/ready', '/api/internal/recovery/wopi'].includes(pathname)) ||
    // Existing authenticated save callbacks retain their normal capability/RLS checks.
    (method === 'POST' && /^\/wopi\/files\/[a-f0-9-]{36}\/contents$/.test(pathname))
  )
}

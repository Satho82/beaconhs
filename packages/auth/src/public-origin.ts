const BIND_HOSTS = new Set(['0.0.0.0', '::', '[::]'])

type PublicOriginEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, 'PUBLIC_APP_URL' | 'APP_URL' | 'BETTER_AUTH_URL' | 'NODE_ENV'>
>

function parseExactOrigin(value: string, name: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`[auth] ${name} must be an exact HTTP(S) origin.`)
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.origin !== value ||
    parsed.username ||
    parsed.password ||
    BIND_HOSTS.has(parsed.hostname)
  ) {
    throw new Error(`[auth] ${name} must be a public HTTP(S) origin, not a bind address.`)
  }
  return parsed
}

/**
 * Resolve the one external origin used in every authentication email.
 *
 * APP_URL is the documented deployment setting. PUBLIC_APP_URL can override it
 * for installations whose worker/internal address differs from the public web
 * address. BETTER_AUTH_URL remains the final compatibility fallback, but is
 * validated so a listener such as 0.0.0.0 can never become a user-facing link.
 */
export function resolveAuthPublicOrigin(env: PublicOriginEnvironment = process.env): string {
  const candidates = [
    ['PUBLIC_APP_URL', env.PUBLIC_APP_URL],
    ['APP_URL', env.APP_URL],
    ['BETTER_AUTH_URL', env.BETTER_AUTH_URL],
  ] as const
  const configured = candidates.find(([, value]) => value?.trim())
  if (!configured) {
    if (env.NODE_ENV === 'production') {
      throw new Error('[auth] PUBLIC_APP_URL or APP_URL is required in production.')
    }
    return 'http://localhost:3000'
  }
  const [name, raw] = configured
  const origin = parseExactOrigin(raw!.trim(), name)
  if (env.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    throw new Error(`[auth] ${name} must use HTTPS in production.`)
  }
  return origin.origin
}

import 'server-only'

import { db, withSuperAdmin } from '@beaconhs/db'
import { platformErrorLog } from '@beaconhs/db/schema'

const MAX_MESSAGE_LENGTH = 500

function sanitiseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unhandled platform request error'
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[database-url-redacted]')
    .replace(/bearer\s+[\w.-]+/gi, 'Bearer [redacted]')
    .replace(/(token|password|secret)=\S+/gi, '$1=[redacted]')
    .slice(0, MAX_MESSAGE_LENGTH)
}

function requestPath(request: unknown) {
  if (!request || typeof request !== 'object' || !('url' in request)) return undefined
  const url = request.url
  if (typeof url !== 'string') return undefined

  try {
    return new URL(url).pathname
  } catch {
    return undefined
  }
}

/** Best-effort ingestion: it must never obscure the original request error. */
export async function recordPlatformError(error: unknown, request?: unknown) {
  try {
    await withSuperAdmin(db, (tx) =>
      tx.insert(platformErrorLog).values({
        source: 'request',
        message: sanitiseMessage(error),
        path: requestPath(request),
      }),
    )
  } catch {
    // The primary error remains the authoritative failure if logging is unavailable.
  }
}

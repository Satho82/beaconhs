import 'server-only'

import { db, withSuperAdmin } from '@beaconhs/db'
import { platformErrorLog } from '@beaconhs/db/schema'

const safeMessage = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 500) : 'Unhandled platform request error'

export async function recordPlatformError(error: unknown, request?: { url?: string }) {
  try {
    await withSuperAdmin(db, (tx) =>
      tx.insert(platformErrorLog).values({
        source: 'request',
        message: safeMessage(error),
        path: request?.url ? new URL(request.url).pathname : undefined,
      }),
    )
  } catch {
    // Error capture must never hide or replace the original failure.
  }
}

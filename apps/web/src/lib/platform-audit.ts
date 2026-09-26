import 'server-only'

import { db, withSuperAdmin } from '@beaconhs/db'
import { platformAuditLog } from '@beaconhs/db/schema'
import type { PlatformOperator } from './auth'

export async function recordPlatformAudit(
  operator: PlatformOperator,
  event: {
    entityType: string
    entityId?: string
    action: string
    summary?: string
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await withSuperAdmin(db, (tx) =>
    tx.insert(platformAuditLog).values({ actorUserId: operator.userId, ...event }),
  )
}

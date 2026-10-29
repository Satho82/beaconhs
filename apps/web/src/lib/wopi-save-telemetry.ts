import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db, withTenant, withSuperAdmin, type Database } from '@beaconhs/db'
import { auditLog } from '@beaconhs/db/schema'
import type { WopiGrant } from './wopi'
import {
  DEV_COMPOSE,
  MAX_SAVE_EVENTS,
  SAVE_ENTITY,
  recoveryConfig,
  summarizeSaves,
} from './wopi-save-state'

// A status response identifies the actual serving process. An external collector
// must cover every expected task; reaching one load-balanced replica is not proof.
const producer = randomUUID()
const startedAt = new Date().toISOString()
export type SaveAttempt = { id: string; tenantId: string; actorUserId: string; epoch: string }

async function event(tx: Database, attempt: SaveAttempt, phase: string) {
  await tx.insert(auditLog).values({
    tenantId: attempt.tenantId,
    actorUserId: attempt.actorUserId,
    entityType: SAVE_ENTITY,
    entityId: attempt.id,
    action: 'update',
    dedupKey: `wopi-save:${attempt.id}:${phase}`,
    summary: 'DEV WOPI save lifecycle',
    metadata: { version: 1, composeId: DEV_COMPOSE, epoch: attempt.epoch, producer, phase },
  })
}

export async function beginSave(grant: WopiGrant): Promise<SaveAttempt | null> {
  const config = recoveryConfig()
  if (!config) return null // Other deployments retain existing behavior.
  const attempt = {
    id: randomUUID(),
    tenantId: grant.tenantId,
    actorUserId: grant.userId,
    epoch: config.epoch,
  }
  await withTenant(db, grant.tenantId, (tx) => event(tx, attempt, 'begin'))
  return attempt
}

/** MUST run on the attachment update's transaction, never after its commit. */
export async function commitSave(tx: Database, attempt: SaveAttempt | null) {
  if (attempt) await event(tx, attempt, 'committed')
}

export async function failSave(attempt: SaveAttempt | null, cleanup = false) {
  if (attempt)
    await withTenant(db, attempt.tenantId, (tx) =>
      event(tx, attempt, cleanup ? 'cleanup_failed' : 'failed'),
    )
}

export async function settleSave(attempt: SaveAttempt | null) {
  if (attempt) await withTenant(db, attempt.tenantId, (tx) => event(tx, attempt, 'settled'))
}

/** Called only after exact DEV binding and dedicated aggregate-observer authentication. */
export async function saveStatus() {
  const config = recoveryConfig()
  if (!config) throw new Error('WOPI_RECOVERY_DISABLED')
  return withSuperAdmin(db, async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`)
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`)
    const events = await tx
      .select({
        id: auditLog.id,
        tenantId: auditLog.tenantId,
        entityId: auditLog.entityId,
        metadata: auditLog.metadata,
      })
      .from(auditLog)
      // A malformed/foreign binding must poison status, not be silently filtered
      // out of the ledger and mistaken for absence of a save.
      .where(eq(auditLog.entityType, SAVE_ENTITY))
      .limit(MAX_SAVE_EVENTS + 1)
    const times = await tx.execute(sql`SELECT clock_timestamp() AS observed_at`)
    const observedAt = new Date(times[0]!.observed_at as string).toISOString()
    return {
      version: 1,
      composeId: DEV_COMPOSE,
      ...config,
      producer,
      startedAt,
      observedAt,
      validForSeconds: 15,
      ...summarizeSaves(events),
      coverage: 'REQUIRES_INDEPENDENT_TASK_AND_CUTOVER_VERIFICATION',
      drainageProven: false,
    }
  })
}

import { createHash } from 'node:crypto'

export const DEV_COMPOSE = 'wYb0LxLQrvj2FPI21i-Oj'
export const SAVE_ENTITY = 'wopi_save_dev_v1'
export const MAX_SAVE_EVENTS = 10_000
export type SaveEvent = {
  id: string
  tenantId: string
  entityId: string | null
  metadata: Record<string, unknown>
}

/** Complete event-set watermark, not MAX(success timestamp). No identifiers escape. */
export function summarizeSaves(events: SaveEvent[]) {
  if (events.length > MAX_SAVE_EVENTS) throw new Error('WOPI_LEDGER_CAPACITY')
  const attempts = new Map<string, Set<string>>()
  const identities = new Set<string>()
  for (const event of events) {
    const m = event.metadata
    if (
      identities.has(event.id) ||
      !event.entityId ||
      m.version !== 1 ||
      m.composeId !== DEV_COMPOSE ||
      typeof m.epoch !== 'string' ||
      !/^[a-f0-9]{64}$/.test(m.epoch) ||
      typeof m.producer !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(m.producer) ||
      typeof m.phase !== 'string' ||
      !['begin', 'committed', 'failed', 'cleanup_failed', 'settled'].includes(m.phase)
    )
      throw new Error('WOPI_LEDGER_INVALID')
    identities.add(event.id)
    const key = `${event.tenantId}:${event.entityId}`
    const phases = attempts.get(key) ?? new Set<string>()
    if (phases.has(String(m.phase))) throw new Error('WOPI_LEDGER_DUPLICATE')
    phases.add(String(m.phase))
    attempts.set(key, phases)
  }
  let inFlight = 0
  let failedSaves = 0
  let unknownOutcomes = 0
  let completedSaves = 0
  for (const phases of attempts.values()) {
    if (
      !phases.has('begin') ||
      (phases.has('committed') && phases.has('failed')) ||
      ((phases.has('settled') || phases.has('cleanup_failed')) && !phases.has('committed')) ||
      (phases.has('settled') && phases.has('cleanup_failed'))
    ) {
      unknownOutcomes++
    } else if (phases.has('failed') || phases.has('cleanup_failed')) {
      failedSaves++
    } else if (phases.has('committed') && phases.has('settled')) {
      completedSaves++
    } else {
      inFlight++
    }
  }
  const watermark = createHash('sha256')
    .update(
      JSON.stringify(
        [...events]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((e) => [
            e.id,
            e.tenantId,
            e.entityId,
            e.metadata.epoch,
            e.metadata.producer,
            e.metadata.phase,
          ]),
      ),
    )
    .digest('hex')
  return {
    inFlight,
    failedSaves,
    unknownOutcomes,
    completedSaves,
    eventCount: events.length,
    completionWatermark: watermark,
  }
}

export function recoveryConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (!env.UVANOO_WOPI_RECOVERY_EPOCH && !env.UVANOO_RECOVERY_COMPOSE_ID) return null
  if (
    env.UVANOO_RECOVERY_COMPOSE_ID !== DEV_COMPOSE ||
    env.BETTER_AUTH_URL !== 'https://dev.uvanoo.com' ||
    !/^[a-f0-9]{64}$/.test(env.UVANOO_WOPI_RECOVERY_EPOCH ?? '') ||
    !/^[a-f0-9]{40}$/.test(env.UVANOO_RECOVERY_SOURCE_SHA ?? '')
  ) {
    throw new Error('WOPI_RECOVERY_BINDING_INVALID')
  }
  return { epoch: env.UVANOO_WOPI_RECOVERY_EPOCH!, sourceSha: env.UVANOO_RECOVERY_SOURCE_SHA! }
}

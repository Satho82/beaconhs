import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { RequestContext } from '@beaconhs/tenant'

const state = vi.hoisted(() => ({
  parents: [] as Array<{ id: string }>,
  conditions: [] as unknown[],
  visible: 0,
}))
vi.mock('@beaconhs/db', async (original) => ({
  ...(await original<typeof import('@beaconhs/db')>()),
  withSuperAdmin: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) =>
    run({
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            state.conditions.push(condition)
            return { limit: async () => state.parents }
          },
        }),
      }),
    }),
}))
import { canReadIncidentAttachment } from './attachment-access'

const tenantId = '10000000-0000-4000-8000-000000000001'
const attachmentId = '70000000-0000-4000-8000-000000000001'
const ctx = {
  tenantId,
  db: async (run: (tx: unknown) => Promise<unknown>) =>
    run({
      select: () => ({ from: () => ({ where: async () => [{ value: state.visible }] }) }),
    }),
} as RequestContext

describe('Incident evidence authorization', () => {
  beforeEach(() => {
    state.parents = []
    state.conditions = []
    state.visible = 0
  })
  it('finds hidden links within the tenant and denies inaccessible evidence', async () => {
    state.parents = [{ id: 'other-hotel' }]
    expect(await canReadIncidentAttachment(ctx, attachmentId)).toBe(false)
    const query = new PgDialect().sqlToQuery(
      state.conditions[0] as Parameters<PgDialect['sqlToQuery']>[0],
    )
    expect(query.params).toContain(tenantId)
    expect(query.params).toContain(attachmentId)
  })
  it('does not let a visible new link hide an inaccessible original parent', async () => {
    state.parents = [{ id: 'other-hotel' }, { id: 'my-hotel' }]
    state.visible = 1
    expect(await canReadIncidentAttachment(ctx, attachmentId)).toBe(false)
  })
  it('allows Cluster access when both linked properties are authorized', async () => {
    state.parents = [{ id: 'fenchurch' }, { id: 'lincoln' }]
    state.visible = 2
    expect(await canReadIncidentAttachment(ctx, attachmentId)).toBe(true)
  })
  it('deduplicates repeated links to an authorized Incident', async () => {
    state.parents = [{ id: 'fenchurch' }, { id: 'fenchurch' }]
    state.visible = 1
    expect(await canReadIncidentAttachment(ctx, attachmentId)).toBe(true)
  })
  it('retains existing tenant/capability checks for new unlinked uploads', async () => {
    expect(await canReadIncidentAttachment(ctx, attachmentId)).toBe(true)
  })
  it('fails closed on an unexpectedly large linkage set', async () => {
    state.parents = Array.from({ length: 1001 }, (_, index) => ({ id: String(index) }))
    expect(await canReadIncidentAttachment(ctx, attachmentId)).toBe(false)
  })
})

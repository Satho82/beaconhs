import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import type { RequestContext } from '@beaconhs/tenant'
const state = vi.hoisted(() => ({
  parents: [] as { id: string }[],
  visible: [] as { id: string }[],
  query: null as unknown,
}))
vi.mock('@beaconhs/db', async (original) => ({
  ...(await original<typeof import('@beaconhs/db')>()),
  withSuperAdmin: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) =>
    run({
      execute: async (query: unknown) => {
        state.query = query
        return state.parents
      },
    }),
}))
import { canReadInspectionComplianceAttachment } from './inspection-compliance-attachment-access'
const ctx = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  db: async (run: (tx: unknown) => Promise<unknown>) => run({ execute: async () => state.visible }),
} as RequestContext
const attachmentId = '70000000-0000-4000-8000-000000000001'
describe('inspection/compliance evidence property boundary', () => {
  beforeEach(() => {
    state.parents = []
    state.visible = []
    state.query = null
  })
  it.each(['inspection:', 'equipment:', 'compliance:'])(
    'denies an inaccessible %s parent',
    async (kind) => {
      state.parents = [{ id: kind + 'A2' }]
      expect(await canReadInspectionComplianceAttachment(ctx, attachmentId)).toBe(false)
    },
  )
  it('does not launder shared evidence through an accessible link', async () => {
    state.parents = [{ id: 'inspection:A1' }, { id: 'compliance:A2' }]
    state.visible = [state.parents[0]!]
    expect(await canReadInspectionComplianceAttachment(ctx, attachmentId)).toBe(false)
  })
  it('rechecks current assignment on every download', async () => {
    state.parents = [{ id: 'inspection:A1' }, { id: 'inspection:A3' }]
    state.visible = [...state.parents]
    expect(await canReadInspectionComplianceAttachment(ctx, attachmentId)).toBe(true)
    state.visible = [state.parents[0]!]
    expect(await canReadInspectionComplianceAttachment(ctx, attachmentId)).toBe(false)
  })
  it('tenant-pins all parent queries and covers criteria, signatures and document versions', async () => {
    expect(await canReadInspectionComplianceAttachment(ctx, attachmentId)).toBe(true)
    const query = new PgDialect().sqlToQuery(state.query as SQL)
    expect(query.params).toContain(ctx.tenantId)
    expect(query.params).toContain(attachmentId)
    for (const source of [
      'photo_attachment_ids',
      'customer_signature_attachment_id',
      'document_versions',
    ])
      expect(query.sql).toContain(source)
  })
  it('fails closed beyond the bounded parent set', async () => {
    state.parents = Array.from({ length: 1001 }, (_, i) => ({ id: String(i) }))
    expect(await canReadInspectionComplianceAttachment(ctx, attachmentId)).toBe(false)
  })
})

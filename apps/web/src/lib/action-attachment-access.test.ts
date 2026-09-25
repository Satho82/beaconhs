import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { RequestContext } from '@beaconhs/tenant'

const state = vi.hoisted(() => ({
  parents: [[], [], []] as Array<Array<{ id: string }>>,
  parentIndex: 0,
  conditions: [] as unknown[],
  visible: [] as number[],
}))
vi.mock('@beaconhs/db', async (original) => ({
  ...(await original<typeof import('@beaconhs/db')>()),
  withSuperAdmin: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) =>
    run({
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            state.conditions.push(condition)
            return { limit: async () => state.parents[state.parentIndex++] ?? [] }
          },
        }),
      }),
    }),
}))
import { canReadActionAttachment } from './action-attachment-access'

const tenantId = '10000000-0000-4000-8000-000000000001'
const attachmentId = '70000000-0000-4000-8000-000000000001'
const ctx = {
  tenantId,
  db: async (run: (tx: unknown) => Promise<unknown>) =>
    run({
      select: () => ({ from: () => ({ where: async () => [{ value: state.visible.shift() }] }) }),
    }),
} as RequestContext

describe('Action evidence and stored-report delivery', () => {
  beforeEach(() => {
    state.parents = [[], [], []]
    state.parentIndex = 0
    state.conditions = []
    state.visible = []
  })
  it('discovers otherwise hidden parent links without leaking their content', async () => {
    state.parents = [[{ id: 'foreign-action' }], [], []]
    state.visible = [0]
    expect(await canReadActionAttachment(ctx, attachmentId)).toBe(false)
    for (const condition of state.conditions) {
      const query = new PgDialect().sqlToQuery(condition as Parameters<PgDialect['sqlToQuery']>[0])
      expect(query.params).toContain(tenantId)
      expect(query.params).toContain(attachmentId)
    }
  })
  it('allows evidence only when every linked Action is visible', async () => {
    state.parents = [[{ id: 'a' }, { id: 'b' }], [], []]
    state.visible = [1]
    expect(await canReadActionAttachment(ctx, attachmentId)).toBe(false)
  })
  it('supports Cluster access to evidence linked within its assigned properties', async () => {
    state.parents = [[{ id: 'a' }, { id: 'b' }], [], []]
    state.visible = [2]
    expect(await canReadActionAttachment(ctx, attachmentId)).toBe(true)
  })
  it('protects signatures as well as photos', async () => {
    state.parents = [[], [{ id: 'foreign-action' }], []]
    state.visible = [0]
    expect(await canReadActionAttachment(ctx, attachmentId)).toBe(false)
  })
  it('denies a cached report hidden by current property authorization', async () => {
    state.parents = [[], [], [{ id: 'report' }]]
    state.visible = [0]
    expect(await canReadActionAttachment(ctx, attachmentId)).toBe(false)
  })
  it('allows a stored report with verified current scope', async () => {
    state.parents = [[], [], [{ id: 'report' }]]
    state.visible = [1]
    expect(await canReadActionAttachment(ctx, attachmentId)).toBe(true)
  })
  it('leaves unlinked uploads to the existing capability and tenant checks', async () => {
    expect(await canReadActionAttachment(ctx, attachmentId)).toBe(true)
  })
  it('fails closed rather than truncating an unexpectedly large linkage set', async () => {
    state.parents = [Array.from({ length: 1001 }, (_, n) => ({ id: String(n) })), [], []]
    expect(await canReadActionAttachment(ctx, attachmentId)).toBe(false)
  })
})

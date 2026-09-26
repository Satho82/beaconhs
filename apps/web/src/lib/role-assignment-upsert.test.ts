import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@beaconhs/db'
import { roleAssignments } from '@beaconhs/db/schema'
import { PgDialect } from 'drizzle-orm/pg-core'
import { upsertRoleAssignments } from './role-assignment-upsert'

describe('upsertRoleAssignments', () => {
  const A1 = '20000000-0000-4000-8000-000000000001'
  const A3 = '20000000-0000-4000-8000-000000000003'
  const B1 = '20000000-0000-4000-8000-000000000004'
  function propertyDatabase(visible: string[]) {
    const lock = vi.fn().mockResolvedValue(visible.map((id) => ({ id })))
    const where = vi.fn().mockReturnValue({ for: lock })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const returning = vi.fn().mockResolvedValue([{ membershipId: 'member-a' }])
    const values = vi
      .fn()
      .mockReturnValue({ onConflictDoUpdate: vi.fn().mockReturnValue({ returning }) })
    const insert = vi.fn().mockReturnValue({ values })
    return { tx: { select, insert } as unknown as Database, where, insert }
  }
  const assignment = (ids: string[]) => ({
    tenantId: 'tenant-a',
    tenantUserId: 'member-a',
    roleId: 'role-a',
    scope: { type: 'properties' as const, propertyIds: ids },
  })
  it('validates property ownership even for a platform administrator', async () => {
    const { tx, where } = propertyDatabase([A1, A3])
    await upsertRoleAssignments({ isSuperAdmin: true }, tx, [assignment([A1, A3])])
    const query = new PgDialect().sqlToQuery(where.mock.calls[0]![0])
    expect(query.params).toEqual(['tenant-a', A1, A3])
    expect(query.sql).toContain('"hospitality_properties"."deleted_at" is null')
  })
  it.each([[B1], [A1, B1]])(
    'rejects foreign or mixed-tenant property payload %j',
    async (...ids) => {
      const { tx, insert } = propertyDatabase(ids.includes(A1) ? [A1] : [])
      await expect(
        upsertRoleAssignments({ isSuperAdmin: true }, tx, [assignment(ids)]),
      ).rejects.toThrow('belong to the user’s tenant')
      expect(insert).not.toHaveBeenCalled()
    },
  )
  it('rejects a forged property before writing any assignment', async () => {
    const { tx, insert } = propertyDatabase([])
    await expect(
      upsertRoleAssignments({ isSuperAdmin: true }, tx, [assignment(['forged'])]),
    ).rejects.toThrow('Invalid property assignment')
    expect(insert).not.toHaveBeenCalled()
  })
  it('allows an empty scope to revoke all property access', async () => {
    const { tx, insert, where } = propertyDatabase([])
    await upsertRoleAssignments({ isSuperAdmin: true }, tx, [assignment([])])
    expect(where).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledOnce()
  })

  it('uses the complete tenant/member/role unique key and updates the scope', async () => {
    const returning = vi.fn().mockResolvedValue([{ membershipId: 'membership-1' }])
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning })
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
    const insert = vi.fn().mockReturnValue({ values })
    const tx = { insert } as unknown as Database

    const result = await upsertRoleAssignments({ isSuperAdmin: true }, tx, [
      {
        tenantId: 'tenant-1',
        tenantUserId: 'membership-1',
        roleId: 'role-1',
        scope: { type: 'self' },
      },
    ])

    expect(insert).toHaveBeenCalledWith(roleAssignments)
    expect(values).toHaveBeenCalledWith([
      {
        tenantId: 'tenant-1',
        tenantUserId: 'membership-1',
        roleId: 'role-1',
        scope: { type: 'self' },
      },
    ])
    expect(onConflictDoUpdate).toHaveBeenCalledOnce()
    const conflict = onConflictDoUpdate.mock.calls[0]?.[0]
    expect(conflict?.target).toEqual([
      roleAssignments.tenantId,
      roleAssignments.tenantUserId,
      roleAssignments.roleId,
    ])
    expect(conflict?.set.scope).toBeDefined()
    expect(conflict?.set.updatedAt).toBeDefined()
    expect(conflict?.setWhere).toBeDefined()
    expect(result).toEqual(['membership-1'])
  })

  it('does not issue an empty insert', async () => {
    const insert = vi.fn()
    const result = await upsertRoleAssignments(
      { isSuperAdmin: true },
      { insert } as unknown as Database,
      [],
    )

    expect(insert).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('reports no changed member when the conflict scope is already identical', async () => {
    const returning = vi.fn().mockResolvedValue([])
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning })
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
    const tx = { insert: vi.fn().mockReturnValue({ values }) } as unknown as Database

    const result = await upsertRoleAssignments({ isSuperAdmin: true }, tx, [
      {
        tenantId: 'tenant-1',
        tenantUserId: 'membership-1',
        roleId: 'role-1',
        scope: { type: 'self' },
      },
    ])

    expect(result).toEqual([])
  })
})

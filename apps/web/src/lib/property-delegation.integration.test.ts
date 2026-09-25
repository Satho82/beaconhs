import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createSuperClient, type Database } from '@beaconhs/db'
import {
  auditLog,
  hospitalityProperties,
  roles,
  tenantUsers,
  tenants,
  users,
} from '@beaconhs/db/schema'
import { can, canSeeProperty, resolveMembershipAccess, type RequestContext } from '@beaconhs/tenant'
import { upsertRoleAssignments } from './role-assignment-upsert'
import { assertManageableMember, assertDelegablePermissions } from './access-delegation'
import { actorMayImpersonate } from './impersonation'

describe.skipIf(process.env.UVANOO_PROPERTY_DELEGATION_INTEGRATION !== '1')(
  'disposable generic property delegation',
  () => {
    it('enforces tenant, hierarchy, privilege, add/remove and history boundaries', async () => {
      const url = new URL(process.env.SUPERADMIN_DATABASE_URL!)
      if (!url.pathname.includes('test') || /staging|production/i.test(url.pathname))
        throw new Error('Disposable test database required')
      const client = createSuperClient()
      const rollback = new Error('rollback successful K0 fixture')
      try {
        await expect(
          client.db.transaction(async (tx) => {
            const a = randomUUID(),
              b = randomUUID()
            const [a1, a2, a3, b1] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()] as [
              string,
              string,
              string,
              string,
            ]
            const manager = randomUUID(),
              operational = randomUUID(),
              privileged = randomUUID()
            const target = randomUUID(),
              single = randomUUID(),
              foreign = randomUUID(),
              superMember = randomUUID()
            const identity = randomUUID(),
              superIdentity = randomUUID()
            await tx.insert(tenants).values([
              { id: a, slug: 'k0-' + a, name: 'Tenant A' },
              { id: b, slug: 'k0-' + b, name: 'Tenant B' },
            ])
            await tx.insert(users).values([
              { id: identity, email: identity + '@example.invalid', name: 'Test user' },
              {
                id: superIdentity,
                email: superIdentity + '@example.invalid',
                name: 'Protected platform admin',
                isSuperAdmin: true,
              },
            ])
            await tx.insert(tenantUsers).values({ id: target, tenantId: a, userId: identity })
            const singleIdentity = randomUUID()
            await tx.insert(users).values({
              id: singleIdentity,
              email: singleIdentity + '@example.invalid',
              name: 'Single-property user',
            })
            await tx.insert(tenantUsers).values([
              { id: single, tenantId: a, userId: singleIdentity },
              { id: foreign, tenantId: b, userId: identity },
              { id: superMember, tenantId: a, userId: superIdentity },
            ])
            const managerPermissions = [
              'admin.users.manage',
              'admin.users.impersonate',
              'hospitality.read',
              'hospitality.manage',
            ]
            await tx.insert(roles).values([
              {
                id: manager,
                tenantId: a,
                key: 'k0-manager',
                name: 'Manager',
                permissions: managerPermissions,
              },
              {
                id: operational,
                tenantId: a,
                key: 'k0-operational',
                name: 'Operational',
                permissions: ['hospitality.read'],
              },
              {
                id: privileged,
                tenantId: a,
                key: 'k0-privileged',
                name: 'Privileged',
                permissions: ['admin.roles.manage'],
              },
            ])
            await tx.insert(hospitalityProperties).values([
              { id: a1, tenantId: a, name: 'A1', code: 'A1', timezone: 'UTC' },
              { id: a2, tenantId: a, name: 'A2', code: 'A2', timezone: 'UTC' },
              { id: a3, tenantId: a, name: 'A3', code: 'A3', timezone: 'UTC' },
              { id: b1, tenantId: b, name: 'B1', code: 'B1', timezone: 'UTC' },
            ])
            const actor = (ids: string[]) =>
              ({
                isSuperAdmin: false,
                tenantId: a,
                scopes: [{ type: 'properties', propertyIds: ids }],
                permissions: new Set(managerPermissions),
              }) as RequestContext
            const assignment = (member: string, ids: string[], roleId = manager, tenantId = a) => ({
              tenantId,
              tenantUserId: member,
              roleId,
              scope: { type: 'properties' as const, propertyIds: ids },
            })
            const write = (
              who: Parameters<typeof upsertRoleAssignments>[0],
              member: string,
              ids: string[],
              roleId = manager,
              tenantId = a,
            ) =>
              tx.transaction((inner) =>
                upsertRoleAssignments(who, inner as unknown as Database, [
                  assignment(member, ids, roleId, tenantId),
                ]),
              )
            // Even a platform connection must reject foreign, mixed, forged and inactive properties.
            await expect(write({ isSuperAdmin: true }, target, [b1])).rejects.toThrow()
            await expect(write({ isSuperAdmin: true }, target, [a1, b1])).rejects.toThrow()
            await expect(write({ isSuperAdmin: true }, target, ['forged'])).rejects.toThrow()
            await expect(write({ isSuperAdmin: true }, foreign, [a1])).rejects.toThrow()
            const vp = actor([a1, a2, a3]),
              cluster = actor([a1, a3]),
              hotel = actor([a1])
            await write(vp, target, [a1, a3])
            await write(cluster, single, [a1], operational)
            await write(cluster, single, [a3], operational)
            await expect(write(cluster, single, [a2], operational)).rejects.toThrow()
            await expect(write(hotel, single, [a1], operational)).rejects.toThrow() // existing A3 is outside this administrator
            await write(cluster, single, [a1], operational)
            await write(hotel, single, [a1], operational)
            expect(
              await actorMayImpersonate(
                tx as unknown as Database,
                { id: identity, isSuperAdmin: false },
                a,
                single,
              ),
            ).toBe(true)
            await expect(write(hotel, single, [a2], operational)).rejects.toThrow()
            await expect(write(cluster, target, [a1, a3], privileged)).rejects.toThrow()
            await expect(write(cluster, foreign, [a1], manager, b)).rejects.toThrow()
            await expect(write(cluster, superMember, [a1], operational)).rejects.toThrow()
            expect(() => assertDelegablePermissions(cluster, ['platform.users.manage'])).toThrow()
            await expect(
              assertManageableMember(tx as unknown as Database, cluster, a, foreign),
            ).rejects.toThrow()
            const history = randomUUID()
            await tx.insert(auditLog).values({
              id: history,
              tenantId: a,
              actorUserId: identity,
              entityType: 'tenant_user',
              entityId: target,
              action: 'update',
              summary: 'Historical fixture',
            })
            await write(vp, target, [a1, a2, a3])
            let access = await resolveMembershipAccess(tx as unknown as Database, target)
            expect(canSeeProperty({ ...actor([]), ...access }, a2)).toBe(true)
            await write(vp, target, [a1, a3])
            await write(cluster, target, [a3])
            expect(
              await actorMayImpersonate(
                tx as unknown as Database,
                { id: identity, isSuperAdmin: false },
                a,
                single,
              ),
            ).toBe(false)
            access = await resolveMembershipAccess(tx as unknown as Database, target)
            const current = { ...actor([]), ...access }
            expect(canSeeProperty(current, a3)).toBe(true)
            for (const id of [a1, a2, b1]) expect(canSeeProperty(current, id)).toBe(false)
            const singleAccess = await resolveMembershipAccess(tx as unknown as Database, single)
            expect(can({ ...actor([]), ...singleAccess }, 'hospitality.manage')).toBe(false)
            expect(
              await tx.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.id, history)),
            ).toHaveLength(1)
            // Tenant RLS is independent of server-side payload validation.
            const runtime = new URL(process.env.DATABASE_URL!).username
            await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(runtime)}`)
            await tx.execute(sql`SELECT set_config('app.tenant_id', ${a}, true)`)
            expect(
              await tx
                .select({ id: hospitalityProperties.id })
                .from(hospitalityProperties)
                .where(eq(hospitalityProperties.id, b1)),
            ).toHaveLength(0)
            throw rollback
          }),
        ).rejects.toBe(rollback)
      } finally {
        await client.sql.end()
      }
    }, 60000)
  },
)

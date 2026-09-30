import { beforeEach, expect, it, vi } from 'vitest'
import { BUILTIN_ROLES } from '@beaconhs/db/schema'

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>[]>(),
  property: vi.fn(),
  assignments: vi.fn(),
}))
vi.mock('./dev-first-identity', () => ({ requireFirstIdentityTarget: vi.fn() }))
vi.mock('../src/lib/hospitality/properties', () => ({ createProperty: state.property }))
vi.mock('../src/lib/role-assignment-upsert', () => ({ upsertRoleAssignments: state.assignments }))
vi.mock('@beaconhs/tenant', async (original) => ({
  ...(await original<typeof import('@beaconhs/tenant')>()),
  makeTenantContext: (db: unknown, args: Record<string, unknown>) => ({
    ...args,
    db: (callback: (tx: unknown) => unknown) => callback(db),
  }),
  resolveMembershipAccess: async () => ({
    permissions: new Set(['admin.settings.manage', 'hospitality.manage']),
    scopes: [{ type: 'tenant' }],
  }),
}))
vi.mock('@beaconhs/db', async () => {
  const { getTableName } = await import('drizzle-orm')
  const tx = {
    transaction: async (callback: (value: unknown) => unknown) => callback(tx),
    execute: async () => [{ database: 'beaconhs', role: 'beaconhs_super', address: '172.30.0.2' }],
    select: (fields?: Record<string, unknown>) => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const rows = state.rows.get(getTableName(table)) ?? []
        const result = fields?.total ? [{ total: rows.length }] : rows
        return {
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
          where: async () => result,
        }
      },
    }),
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (input: Record<string, unknown>) => {
        const key = getTableName(table)
        const rows = state.rows.get(key) ?? []
        const row = {
          id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, '0')}`,
          ...input,
        }
        rows.push(row)
        state.rows.set(key, rows)
        return { returning: async () => [row] }
      },
    }),
    update: () => ({ set: () => ({ where: async () => [] }) }),
  }
  return {
    createClient: () => ({ db: tx, sql: { end: async () => {} } }),
    extractRows: (value: unknown) => value,
    provisionTenantBaseline: async (_tx: unknown, input: { tenantId: string }) => {
      state.rows.set('roles', [
        {
          id: 'role-1',
          tenantId: input.tenantId,
          key: 'tenant_admin',
          permissions: BUILTIN_ROLES.tenant_admin?.permissions,
        },
      ])
      return { changed: true }
    },
  }
})

import { assertOwnedDevelopmentTenant, provisionMinimalDevTenant } from './dev-minimal-tenant'
const evidence = {
  host: 'vps-c54e0b88',
  container: 'uvanoo-dev-postgres',
  network: 'uvanoo-dev-private',
  containerId: 'a'.repeat(64),
  networkId: 'b'.repeat(64),
  address: '172.30.0.2',
}
const env = { UVANOO_DEV_BOOTSTRAP_CONFIRM: 'CREATE_MINIMAL_DEV_TENANT' }

beforeEach(() => {
  vi.clearAllMocks()
  state.rows.clear()
  state.rows.set('user', [
    {
      id: 'first-user',
      email: 'dev.admin@uvanoo.invalid',
      name: 'DEV Admin',
      isSuperAdmin: false,
      disabledAt: null,
    },
  ])
  state.rows.set('platform_audit_log', [
    { entityType: 'development_first_identity', entityId: 'first-user', action: 'create' },
  ])
  state.assignments.mockImplementation(async (_actor, _tx, assignments) => {
    if (state.rows.get('role_assignments')?.length) return []
    state.rows.set('role_assignments', assignments)
    return [assignments[0].tenantUserId]
  })
  state.property.mockImplementation(async (ctx, input) => {
    expect(ctx.isSuperAdmin).toBe(false)
    const property = { id: 'property-1', tenantId: ctx.tenantId, ...input }
    state.rows.set('hospitality_properties', [property])
    return property
  })
})

it('creates one canonical tenant/property/member/role and reruns without duplicate writes', async () => {
  const first = await provisionMinimalDevTenant(env, evidence)
  const snapshot = JSON.stringify([...state.rows])
  const second = await provisionMinimalDevTenant(env, evidence)
  expect(second).toEqual(first)
  expect(JSON.stringify([...state.rows])).toBe(snapshot)
  expect(state.property).toHaveBeenCalledOnce()
  for (const name of ['tenants', 'tenant_users', 'role_assignments', 'hospitality_properties'])
    expect(state.rows.get(name)).toHaveLength(1)
  expect(first.permission).toBe('admin.settings.manage')
  expect([...state.rows.keys()].sort()).toEqual(
    [
      'user',
      'platform_audit_log',
      'tenants',
      'roles',
      'audit_log',
      'tenant_users',
      'role_assignments',
      'hospitality_properties',
    ].sort(),
  )
})

it('refuses unrelated tenants and leaves them unchanged', async () => {
  state.rows.set('tenants', [
    { id: 'unrelated', slug: 'production-data', name: 'Other', status: 'active', settings: {} },
  ])
  const snapshot = JSON.stringify([...state.rows])
  await expect(provisionMinimalDevTenant(env, evidence)).rejects.toThrow('not the owned')
  expect(JSON.stringify([...state.rows])).toBe(snapshot)
  expect(() =>
    assertOwnedDevelopmentTenant({
      slug: 'uvanoo-development-hotel-group',
      name: 'Uvanoo Development Hotel Group',
      status: 'active',
      settings: {},
    }),
  ).toThrow()
})

it('requires bootstrap provenance, a single non-superadmin identity and explicit confirmation', async () => {
  await expect(provisionMinimalDevTenant({}, evidence)).rejects.toThrow('confirmation')
  state.rows.set('platform_audit_log', [])
  await expect(provisionMinimalDevTenant(env, evidence)).rejects.toThrow('provenance')
  state.rows.get('user')!.push({ id: 'another' })
  await expect(provisionMinimalDevTenant(env, evidence)).rejects.toThrow('only the unprivileged')
})

it('refuses cross-tenant or modified existing membership and role scope', async () => {
  await provisionMinimalDevTenant(env, evidence)
  state.rows.get('role_assignments')![0]!.scope = { type: 'properties', propertyIds: ['unrelated'] }
  await expect(provisionMinimalDevTenant(env, evidence)).rejects.toThrow(
    'unrelated role assignments',
  )
  state.rows.get('tenant_users')![0]!.tenantId = 'other-tenant'
  await expect(provisionMinimalDevTenant(env, evidence)).rejects.toThrow(
    'membership is not canonical',
  )
})

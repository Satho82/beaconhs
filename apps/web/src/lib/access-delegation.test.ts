import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { RequestContext } from '@beaconhs/tenant'
import { can, canSeeProperty, assignedPropertyIds } from '@beaconhs/tenant'
import { assertDelegablePermissions, assertDelegableScope } from './access-delegation'
import { resolveActiveHospitalityProperty } from './hospitality/property-context'

const A1 = '20000000-0000-4000-8000-000000000001'
const A2 = '20000000-0000-4000-8000-000000000002'
const A3 = '20000000-0000-4000-8000-000000000003'
const B1 = '20000000-0000-4000-8000-000000000004'
function actor(ids: string[], permissions = ['admin.users.manage', 'hospitality.read']) {
  return {
    tenantId: 'tenant-a',
    isSuperAdmin: false,
    scopes: [{ type: 'properties', propertyIds: ids }],
    permissions: new Set(permissions),
  } as RequestContext
}

describe('generic hierarchical property delegation', () => {
  it.each([
    [
      [A1, A2, A3],
      [A1, A3],
    ],
    [[A1, A3], [A1]],
    [[A1, A3], [A3]],
    [[A1], [A1]],
    [[A1, A3], []],
  ])('allows only a subset of manageable properties (%j → %j)', (owned, delegated) => {
    expect(() =>
      assertDelegableScope(actor(owned), 'tenant-a', {
        type: 'properties',
        propertyIds: delegated,
      }),
    ).not.toThrow()
  })
  it.each([{ ids: [A1, A3] }, { ids: [A1] }])(
    'denies A2 outside the delegator scope %j',
    ({ ids }) => {
      expect(() =>
        assertDelegableScope(actor(ids), 'tenant-a', { type: 'properties', propertyIds: [A2] }),
      ).toThrow()
    },
  )
  it('denies cross-tenant targets, mixed scope and forged IDs', () => {
    const ctx = actor([A1, A3])
    for (const ids of [[B1], [A1, B1], ['forged']]) {
      expect(() =>
        assertDelegableScope(ctx, 'tenant-a', { type: 'properties', propertyIds: ids }),
      ).toThrow()
    }
    expect(() =>
      assertDelegableScope(ctx, 'tenant-b', { type: 'properties', propertyIds: [A1] }),
    ).toThrow()
  })
  it.each([{ type: 'tenant' }, { type: 'self' }, { type: 'sites', siteIds: ['site-a'] }] as const)(
    'cannot escape a property ceiling through a different scope %j',
    (scope) => {
      expect(() =>
        assertDelegableScope(
          actor([A1]),
          'tenant-a',
          structuredClone(scope) as RequestContext['scopes'][number],
        ),
      ).toThrow()
    },
  )
  it('separates operation permissions from property authority', () => {
    const ctx = actor([A1, A3], ['hospitality.read'])
    expect(canSeeProperty(ctx, A1)).toBe(true)
    expect(can(ctx, 'hospitality.manage')).toBe(false)
    expect(() => assertDelegablePermissions(ctx, ['hospitality.manage'])).toThrow()
    expect(() => assertDelegablePermissions(ctx, ['hospitality.read'])).not.toThrow()
  })
  it.each(['platform.users.manage', 'unknown.permission', 'hospitality.*', '*'])(
    'rejects undelegable privilege %s',
    (permission) => {
      expect(() => assertDelegablePermissions(actor([A1]), [permission])).toThrow()
    },
  )
  it('re-evaluates additions/removals and Portfolio from current assignments', () => {
    const before = actor([A1, A3])
    const after = actor([A3])
    expect(assignedPropertyIds(before)).toEqual([A1, A3])
    expect(canSeeProperty(before, A2)).toBe(false)
    expect(canSeeProperty(before, B1)).toBe(false)
    expect(canSeeProperty(after, A1)).toBe(false)
    expect(canSeeProperty(after, A3)).toBe(true)
    expect(
      resolveActiveHospitalityProperty(
        [A1, A3].map((id) => ({ id })),
        'all',
      ),
    ).toBeNull()
    expect(resolveActiveHospitalityProperty([{ id: A3 }], A1)).toBe(A3)
    expect(canSeeProperty(actor([A1, A2, A3]), A2)).toBe(true)
  })
  it('single-property managers do not gain access from their role', () => {
    const ctx = actor([A2], ['hospitality.read', 'hospitality.manage'])
    expect(canSeeProperty(ctx, A2)).toBe(true)
    for (const id of [A1, A3, B1]) expect(canSeeProperty(ctx, id)).toBe(false)
  })
  it('prefills the existing assignment and retains its role identifier', () => {
    const page = readFileSync(
      new URL('../app/(app)/admin/users/[id]/page.tsx', import.meta.url),
      'utf8',
    )
    expect(page).toContain('defaultScope={a.assignment.scope as RoleScope}')
    expect(page).toContain('name="roleId" value={a.role.id}')
    expect(page).toContain('Edit access scope')
    expect(page).toContain('Save access scope')
  })
})

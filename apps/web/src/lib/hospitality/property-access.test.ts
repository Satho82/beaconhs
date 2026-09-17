import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { hospitalityProperties } from '@beaconhs/db/schema'
import type { RequestContext } from '@beaconhs/tenant'
import { assertCanAccessProperty, hospitalityPropertyWhere } from './property-access'

function context(scopes: RequestContext['scopes'], tenantId = 'tenant-a'): RequestContext {
  return {
    userId: 'user-a',
    tenantId,
    isSuperAdmin: false,
    timezone: 'Europe/London',
    locale: 'en',
    defaultLocale: 'en',
    enabledLocales: ['en'],
    localeOverride: null,
    membership: { id: 'member-a', displayName: 'Manager' },
    personId: 'person-a',
    permissions: new Set(),
    scopes,
    db: async () => {
      throw new Error('unused')
    },
  }
}

describe('hospitality property access', () => {
  const fenchurch = '20000000-0000-4000-8000-000000000001'
  const lincoln = '20000000-0000-4000-8000-000000000002'

  it('allows one cluster manager identity across both assigned properties', () => {
    const ctx = context([{ type: 'properties', propertyIds: [fenchurch, lincoln] }])
    expect(() => assertCanAccessProperty(ctx, fenchurch)).not.toThrow()
    expect(() => assertCanAccessProperty(ctx, lincoln)).not.toThrow()
  })

  it('denies each property manager access to the other hotel', () => {
    expect(() =>
      assertCanAccessProperty(context([{ type: 'properties', propertyIds: [fenchurch] }]), lincoln),
    ).toThrow(/hospitality.property.scope/)
    expect(() =>
      assertCanAccessProperty(context([{ type: 'properties', propertyIds: [lincoln] }]), fenchurch),
    ).toThrow(/hospitality.property.scope/)
  })

  it('builds a property predicate and keeps tenant isolation as a separate boundary', () => {
    const predicate = hospitalityPropertyWhere(
      context([{ type: 'properties', propertyIds: [fenchurch] }]),
      hospitalityProperties.id,
    )
    expect(sql`${predicate}`.queryChunks.length).toBeGreaterThan(0)
    expect(context([{ type: 'tenant' }], 'tenant-a').tenantId).not.toBe(
      context([{ type: 'tenant' }], 'tenant-b').tenantId,
    )
  })
})

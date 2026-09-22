import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Database } from '@beaconhs/db'
import type { RequestContext } from '@beaconhs/tenant'
import {
  ALL_PROPERTIES_CONTEXT,
  applyActiveHospitalityPropertyScope,
  resolveActiveHospitalityProperty,
} from './property-context'

const fenchurch = { id: '20000000-0000-4000-8000-000000000001' }
const lincoln = { id: '20000000-0000-4000-8000-000000000002' }

describe('hospitality property context', () => {
  const context = (propertyIds: string[]) =>
    ({
      isSuperAdmin: false,
      scopes: [{ type: 'properties', propertyIds }],
    }) as RequestContext

  it('narrows a Cluster read transaction to the selected authorised hotel', async () => {
    const execute = vi.fn().mockResolvedValue([])
    const tx = { execute } as unknown as Database
    await applyActiveHospitalityPropertyScope(context([fenchurch.id, lincoln.id]), tx, lincoln.id)
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0])
    expect(query.params).toEqual([JSON.stringify([lincoln.id])])
    expect(query.sql).toContain("set_config('app.action_scope_mode', 'property', true)")
  })

  it('leaves Portfolio bounded by the existing request authorization', async () => {
    const execute = vi.fn()
    await applyActiveHospitalityPropertyScope(
      context([fenchurch.id]),
      { execute } as unknown as Database,
      null,
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects a forged hotel before changing transaction scope', async () => {
    const execute = vi.fn()
    await expect(
      applyActiveHospitalityPropertyScope(
        context([fenchurch.id]),
        { execute } as unknown as Database,
        lincoln.id,
      ),
    ).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })

  it('does not widen an empty property assignment', async () => {
    const execute = vi.fn()
    await expect(
      applyActiveHospitalityPropertyScope(
        context([]),
        { execute } as unknown as Database,
        fenchurch.id,
      ),
    ).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })

  it('keeps an authorised cluster manager selection and supports portfolio context', () => {
    expect(resolveActiveHospitalityProperty([fenchurch, lincoln], fenchurch.id)).toBe(fenchurch.id)
    expect(
      resolveActiveHospitalityProperty([fenchurch, lincoln], ALL_PROPERTIES_CONTEXT),
    ).toBeNull()
  })

  it('ignores an unauthorised cookie property identifier for a single-property user', () => {
    expect(resolveActiveHospitalityProperty([fenchurch], lincoln.id)).toBe(fenchurch.id)
  })

  it('automatically scopes a single-property user to their only property', () => {
    expect(resolveActiveHospitalityProperty([lincoln], ALL_PROPERTIES_CONTEXT)).toBe(lincoln.id)
  })
})

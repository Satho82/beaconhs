import { describe, expect, it } from 'vitest'
import { discoverEntities } from './discover'
import { propertyCertifiedEntities } from './custom-fields'
import { PROPERTY_REPORTING_TABLES } from '@beaconhs/db/rls'

describe('property-restricted analytics inventory', () => {
  it('contains only sources with audited property provenance', () => {
    const sources = propertyCertifiedEntities(discoverEntities())

    expect(sources.length).toBeGreaterThan(0)
    expect(sources.every((source) => PROPERTY_REPORTING_TABLES.has(source.table))).toBe(true)
    expect(sources.some((source) => source.table === 'incident_hours_periods')).toBe(false)
    expect(sources.some((source) => source.table === 'truck_log_entries')).toBe(false)
  })

  it('removes relations that could join outside the certified inventory', () => {
    const sources = propertyCertifiedEntities(discoverEntities())
    const allowed = new Set(sources.map((source) => source.key))

    for (const source of sources) {
      expect(source.relations?.every((relation) => allowed.has(relation.target)) ?? true).toBe(true)
    }
  })
})

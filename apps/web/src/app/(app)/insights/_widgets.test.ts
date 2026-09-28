import { describe, expect, it } from 'vitest'
import { parseBhqlQuery } from '@beaconhs/analytics'
import {
  addTrustedSystemAppResponsesEntity,
  compileBhql,
  discoverEntityMap,
} from '@beaconhs/analytics/server'
import { BUILTIN_QUERIES } from './_widgets'

describe('built-in Insights queries', () => {
  const entityMap = addTrustedSystemAppResponsesEntity(discoverEntityMap())

  it('uses the managed app response source instead of raw Builder storage', () => {
    expect(entityMap.app_responses).toBeDefined()
    expect(entityMap.form_responses).toBeUndefined()
    expect(
      Object.values(BUILTIN_QUERIES).some(({ query }) =>
        query.stages.some(({ source }) => source === 'form_responses'),
      ),
    ).toBe(false)
  })

  it('groups incident sites through the certified incident-to-org-unit relation', () => {
    // Incidents carry only the site UUID.  The display name must be resolved
    // through the RLS-safe composite FK, rather than treating a made-up
    // `site_name` projection as an incidents column.
    expect(entityMap.incidents?.relations).toContainEqual(
      expect.objectContaining({
        via: 'site_org_unit_id',
        target: 'org_units',
        foreignColumn: 'id',
      }),
    )
    const topSites = BUILTIN_QUERIES['chart-top-sites']!
    const stage = topSites.query.stages[0]!
    expect(stage.breakouts).toContainEqual({
      field: 'site_org_unit_id.name',
      alias: 'site',
    })

    expect(() => parseBhqlQuery(topSites.query, entityMap)).not.toThrow()
  })

  for (const [key, definition] of Object.entries(BUILTIN_QUERIES)) {
    it(`validates and compiles ${key}`, () => {
      const query = parseBhqlQuery(definition.query, entityMap)
      const compiled = compileBhql(query, { entityMap })

      expect(compiled.columns.length).toBeGreaterThan(0)
    })
  }
})

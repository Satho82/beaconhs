import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(
  new URL('../app/(app)/corrective-actions/new/page.tsx', import.meta.url),
  'utf8',
)

describe('Corrective Action property authoring', () => {
  it('binds property-scoped writes to the active authorised property', () => {
    expect(page).toContain('await requireAuthoringProperty(ctx)')
    expect(page).toContain('propertyId !== requiredPropertyId')
  })

  it('does not offer another hotel while a property context is active', () => {
    expect(page).toContain('propertyContext.properties.filter')
    expect(page).toContain('authoringProperties.map')
  })
})

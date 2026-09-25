import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(
  new URL('../../app/(app)/hospitality/handover/page.tsx', import.meta.url),
  'utf8',
)

describe('Handover property authoring context', () => {
  it('limits the property selector to the active property', () => {
    expect(page).toContain('const authoringProperties = propertyContext.activePropertyId')
    expect(page).toContain('authoringProperties.map((property)')
  })

  it('rejects a forged property outside the selected property context', () => {
    expect(page).toContain('await requireAuthoringProperty(ctx)')
    expect(page).toContain('propertyId !== requiredPropertyId')
    expect(page).toContain('Create this Handover entry in the property selected')
  })
})

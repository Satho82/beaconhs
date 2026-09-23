import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const audienceSource = readFileSync(new URL('./audience.ts', import.meta.url), 'utf8')
const evaluationSource = readFileSync(new URL('./evaluate.ts', import.meta.url), 'utf8')

describe('property-scoped compliance audience contract', () => {
  it('derives the property from the obligation target and passes it to every audience path', () => {
    expect(evaluationSource).toContain('targetRef.propertyId')
    expect(evaluationSource).toContain('propertyId')
    expect(audienceSource).toContain('propertyAudience')
    expect(audienceSource).toContain("metadata->>'hospitalityPropertyId'")
    expect(audienceSource).toContain('property_assignment.valid_from <= current_date')
    expect(audienceSource).toContain('property_assignment.valid_to >= current_date')
    expect(audienceSource).toContain('const baseActive = and(')
  })
})

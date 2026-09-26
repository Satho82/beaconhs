import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SLIPS_TRIPS_TEMPLATE,
  SLIPS_TRIPS_TEMPLATE_ID,
  slipsTripsTemplateSnapshot,
} from '@beaconhs/db'
import { riskTemplates } from '@beaconhs/db/schema'
import { buildRiskTemplateSnapshot, templateHazardsToInput } from './risk-assessments'

const serviceSource = readFileSync(new URL('./risk-assessments.ts', import.meta.url), 'utf8')
const seedSource = readFileSync(
  new URL('../../../../packages/db/src/seed.ts', import.meta.url),
  'utf8',
)

function templateRow() {
  return {
    ...SLIPS_TRIPS_TEMPLATE,
    hazards: structuredClone(SLIPS_TRIPS_TEMPLATE.hazards),
    peopleAtRiskGuidance: [...SLIPS_TRIPS_TEMPLATE.peopleAtRiskGuidance],
    standardControls: [...SLIPS_TRIPS_TEMPLATE.standardControls],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
  } satisfies typeof riskTemplates.$inferSelect
}

describe('Risk Library and property adoption', () => {
  it('provides the standard active General template with the complete guidance model', () => {
    expect(SLIPS_TRIPS_TEMPLATE.id).toBe(SLIPS_TRIPS_TEMPLATE_ID)
    expect(SLIPS_TRIPS_TEMPLATE.title).toBe('Slips, Trips and Falls')
    expect(SLIPS_TRIPS_TEMPLATE.category).toBe('general')
    expect(SLIPS_TRIPS_TEMPLATE.state).toBe('active')
    expect(SLIPS_TRIPS_TEMPLATE.version).toBe('1.0')
    expect(SLIPS_TRIPS_TEMPLATE.description).toBeTruthy()
    expect(SLIPS_TRIPS_TEMPLATE.areaGuidance).toBeTruthy()
    expect(SLIPS_TRIPS_TEMPLATE.activityEquipmentGuidance).toBeTruthy()
    expect(SLIPS_TRIPS_TEMPLATE.peopleAtRiskGuidance.length).toBeGreaterThan(1)
    expect(SLIPS_TRIPS_TEMPLATE.standardControls.length).toBeGreaterThan(1)
    expect(SLIPS_TRIPS_TEMPLATE.furtherActionGuidance).toBeTruthy()
    expect(SLIPS_TRIPS_TEMPLATE.reviewGuidance).toBeTruthy()
  })

  it('contains multiple representative hotel hazards with initial and residual guidance', () => {
    expect(SLIPS_TRIPS_TEMPLATE.hazards.map((hazard) => hazard.hazard)).toEqual([
      'Wet or slippery floors',
      'Obstructions in walkways',
      'Uneven or damaged surfaces',
      'Poor lighting',
      'Trailing cables',
    ])
    for (const hazard of SLIPS_TRIPS_TEMPLATE.hazards) {
      expect(hazard.peopleAtRisk.length).toBeGreaterThan(0)
      expect(hazard.standardControls.length).toBeGreaterThan(0)
      expect(hazard.initialLikelihood).toBeGreaterThanOrEqual(1)
      expect(hazard.initialSeverity).toBeGreaterThanOrEqual(1)
      expect(hazard.residualLikelihood).toBeGreaterThanOrEqual(1)
      expect(hazard.residualSeverity).toBeGreaterThanOrEqual(1)
    }
  })

  it('creates an independent immutable-by-value adoption snapshot with version provenance', () => {
    const master = templateRow()
    const snapshot = buildRiskTemplateSnapshot(master)
    master.title = 'Changed master'
    master.hazards[0]!.hazard = 'Changed master hazard'

    expect(snapshot.templateId).toBe(SLIPS_TRIPS_TEMPLATE_ID)
    expect(snapshot.version).toBe('1.0')
    expect(snapshot.title).toBe('Slips, Trips and Falls')
    expect(snapshot.hazards[0]!.hazard).toBe('Wet or slippery floors')
    expect(snapshot).toEqual(slipsTripsTemplateSnapshot())
  })

  it('expands every template hazard into an independently editable property hazard', () => {
    const snapshot = buildRiskTemplateSnapshot(templateRow())
    const inputs = templateHazardsToInput(snapshot.hazards)
    inputs[0]!.peopleAtRisk.push('Night workers')
    inputs[0]!.controls = 'Property-specific safe system of work'

    expect(inputs).toHaveLength(5)
    expect(snapshot.hazards[0]!.peopleAtRisk).not.toContain('Night workers')
    expect(snapshot.hazards[0]!.standardControls.join('\n')).not.toBe(inputs[0]!.controls)
  })

  it('lists and filters the library at the data layer', () => {
    expect(serviceSource).toContain('export async function listRiskTemplates')
    expect(serviceSource).toContain('eq(riskTemplates.category, filter.category)')
    expect(serviceSource).toContain('eq(riskTemplates.state, filter.state)')
    expect(serviceSource).toContain('ilike(riskTemplates.title')
  })

  it('seeds the platform template idempotently in fresh or existing seed runs', () => {
    expect(seedSource).toContain('.insert(riskTemplates)')
    expect(seedSource).toContain('.onConflictDoUpdate({')
    expect(seedSource.indexOf('.insert(riskTemplates)')).toBeLessThan(
      seedSource.indexOf('if (inserted.length === 0)'),
    )
  })

  it('enforces property and tenant authorization server-side for adoption and edits', () => {
    expect(serviceSource).toContain('assertCanAccessProperty(ctx, input.propertyId)')
    expect(serviceSource).toContain('eq(hospitalityProperties.tenantId, ctx.tenantId)')
    expect(serviceSource).toContain(
      'or(isNull(riskTemplates.tenantId), eq(riskTemplates.tenantId, ctx.tenantId))',
    )
    expect(serviceSource).toContain('assertCanAccessProperty(ctx, current.propertyId)')
    expect(serviceSource).toContain('hospitalityPropertyWhere(ctx, riskAssessments.propertyId)')
  })

  it('uses the central matrix, persists multiple hazards, and keeps audit atomic', () => {
    expect(serviceSource).toContain('riskScore, type Database')
    expect(serviceSource).toContain('initialScore: riskScore(')
    expect(serviceSource).toContain('residualScore: riskScore(')
    expect(serviceSource).toContain('.insert(riskHazards)')
    expect(serviceSource).toContain('recordAuditInTransaction(tx, ctx')
    expect(serviceSource).not.toContain('recordAudit(ctx')
  })

  it('links Risk further actions to the existing corrective-action lifecycle', () => {
    expect(serviceSource).toContain('.insert(correctiveActions)')
    expect(serviceSource).toContain("sourceEntityType: 'risk_hazard'")
    expect(serviceSource).toContain('ownerTenantUserId: input.ownerTenantUserId')
    expect(serviceSource).toContain('dueOn: input.dueOn')
    expect(serviceSource).toContain('verificationRequired:')
  })
})

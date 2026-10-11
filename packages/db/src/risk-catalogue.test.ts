import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  RISK_CATALOGUE,
  RISK_CATALOGUE_CATEGORIES,
  RISK_CATALOGUE_TEMPLATES,
  riskCatalogueId,
  riskCatalogueMetadata,
  riskCataloguePersistedVersion,
} from './risk-catalogue'

const approved = [
  ['RA-001', 'General Workplace Health & Safety'],
  ['RA-002', 'Slips, Trips and Falls'],
  ['RA-003', 'Manual Handling and Lifting'],
  ['RA-004', 'Working at Height and Ladders'],
  ['RA-005', 'Lone Working and Out-of-Hours Operations'],
  ['RA-006', 'Display Screen Equipment (DSE)'],
  ['RA-007', 'Workplace Violence, Aggression and Abuse'],
  ['RA-008', 'New and Expectant Mothers'],
  ['RA-009', 'Young Workers and Work Experience'],
  ['RA-010', 'Staff Fatigue, Stress and Workload'],
  ['RA-011', 'Fire Safety — Workplace Activities'],
  ['RA-012', 'Emergency Evacuation and Assisted Evacuation'],
  ['RA-013', 'Fire Alarm Activation and Emergency Response'],
  ['RA-014', 'Bomb Threats and Suspicious Packages'],
  ['RA-015', 'Unauthorised Access, Intruders and Security'],
  ['RA-016', 'First Aid and Medical Emergencies'],
  ['RA-017', 'Lift Breakdown and Entrapment'],
  ['RA-018', 'Power Failure and Emergency Lighting'],
  ['RA-019', 'Guest Bedroom and Apartment Cleaning'],
  ['RA-020', 'Bathroom Cleaning and Descaling'],
  ['RA-021', 'COSHH — Cleaning Chemicals'],
  ['RA-022', 'Bed Making and Mattress Handling'],
  ['RA-023', 'Laundry, Linen Handling and Storage'],
  ['RA-024', 'Waste Handling and Sharps'],
  ['RA-025', 'Bodily Fluids and Biohazard Cleaning'],
  ['RA-026', 'Guest Room Inspections and Defect Reporting'],
  ['RA-027', 'Housekeeping Trolleys and Equipment'],
  ['RA-028', 'Pest Control and Infestation Response'],
  ['RA-029', 'General Maintenance and Hand Tools'],
  ['RA-030', 'Electrical Safety and Portable Equipment'],
  ['RA-031', 'Isolation of Equipment and Lockout/Tagout'],
  ['RA-032', 'Plant Rooms and Restricted Technical Areas'],
  ['RA-033', 'Water Hygiene and Legionella Exposure'],
  ['RA-034', 'Hot Water and Scalding'],
  ['RA-035', 'HVAC and Air Conditioning Maintenance'],
  ['RA-036', 'Roof Access and Edge Protection'],
  ['RA-037', 'Contractor and External Works'],
  ['RA-038', 'Asbestos Disturbance During Maintenance'],
  ['RA-039', 'Reception and Front Desk Operations'],
  ['RA-040', 'Guest Luggage Handling and Storage'],
  ['RA-041', 'Public Areas, Corridors and Staircases'],
  ['RA-042', 'Guest Balconies, Windows and Fall Prevention'],
  ['RA-043', 'Guest Kitchenettes and Cooking Appliances'],
  ['RA-044', 'Food Preparation, Pantry and Refreshments'],
  ['RA-045', 'Food Allergens and Cross-Contamination'],
  ['RA-046', 'Deliveries, Loading and Goods Movement'],
  ['RA-047', 'Car Parks and Vehicle Movement'],
  ['RA-048', 'Outdoor Areas, Ice, Snow and Adverse Weather'],
  ['RA-049', 'Swimming Pool, Spa and Leisure Facilities'],
  ['RA-050', 'Communicable Diseases and Infection Control'],
]

describe('Decision 15 approved catalogue', () => {
  it('contains exactly the 50 approved references and verbatim titles', () => {
    expect(RISK_CATALOGUE.map((row) => [row.reference, row.title])).toEqual(approved)
    expect(new Set(RISK_CATALOGUE_TEMPLATES.map((row) => row.id)).size).toBe(50)
    expect(RISK_CATALOGUE.map((row) => row.reference)).toEqual(
      Array.from({ length: 50 }, (_, i) => `RA-${String(i + 1).padStart(3, '0')}`),
    )
  })
  it('preserves the six categories, applicability and draft status', () => {
    expect([...new Set(RISK_CATALOGUE.map((row) => row.category))]).toEqual([
      ...RISK_CATALOGUE_CATEGORIES,
    ])
    for (const row of RISK_CATALOGUE) {
      expect(row.applicability.length).toBeGreaterThan(0)
      expect(row.keywords.length).toBeGreaterThan(0)
      expect(row.adoptionStatus).toBe('draft')
      expect(row.review.approvalDate).toBeNull()
    }
  })
  it('maps editable content and further actions without losing source guidance', () => {
    expect(RISK_CATALOGUE_TEMPLATES.flatMap((row) => row.hazards)).toHaveLength(100)
    for (const row of RISK_CATALOGUE_TEMPLATES) {
      expect(row.tenantId).toBeNull()
      expect(row.scope).toBe('platform')
      expect(row.version).toBe(row.id === riskCatalogueId('RA-002') ? '1.1' : '1.0')
      expect(row.version).toMatch(/^[0-9]+\.[0-9]+$/)
      expect(row.description).toContain('guidance draft for competent review')
      expect(row.reviewGuidance).toContain('not a signed assessment')
      expect(row.furtherActionGuidance.length).toBeGreaterThan(50)
      expect(row.reviewGuidance).toContain('draft')
      for (const hazard of row.hazards) {
        expect(hazard.hazard).toBeTruthy()
        expect(hazard.harm).toBeTruthy()
        expect(hazard.peopleAtRisk.length).toBeGreaterThan(0)
        expect(hazard.standardControls.length).toBeGreaterThan(0)
        expect(hazard.initialLikelihood).toBeGreaterThanOrEqual(1)
        expect(hazard.initialSeverity).toBeLessThanOrEqual(5)
        expect(hazard.residualLikelihood).toBeGreaterThanOrEqual(1)
        expect(hazard.residualSeverity).toBeLessThanOrEqual(5)
      }
    }
  })
  it('binds metadata to stable platform ID and version, never to a tenant title', () => {
    const first = RISK_CATALOGUE_TEMPLATES[0]!
    expect(first.id).toBe('983265d8-4197-5a14-a701-000000000001')
    expect(riskCatalogueId('RA-050')).toBe('983265d8-4197-5a14-a701-000000000032')
    expect(first.version).toBe('1.0')
    expect(riskCatalogueMetadata(first)?.reference).toBe('RA-001')
    expect(riskCatalogueMetadata(first)?.version).toBe('1.0-draft')
    expect(riskCatalogueMetadata({ ...first, scope: 'tenant' })).toBeUndefined()
    expect(riskCatalogueMetadata({ ...first, version: '2.0' })).toBeUndefined()
    expect(riskCatalogueMetadata({ ...first, version: '1.0-draft' })).toBeUndefined()
    const ra002 = RISK_CATALOGUE_TEMPLATES[1]!
    expect(ra002.version).toBe('1.1')
    expect(riskCatalogueMetadata(ra002)).toMatchObject({
      reference: 'RA-002',
      title: 'Slips, Trips and Falls',
      version: '1.0-draft',
      adoptionStatus: 'draft',
    })
    expect(riskCataloguePersistedVersion(RISK_CATALOGUE[1]!)).toBe('1.1')
    expect(() => riskCatalogueId('RA-000')).toThrow()
    expect(() => riskCatalogueId('RA-051')).toThrow()
  })
})

describe('database version contract', () => {
  it('maps every draft catalogue source version to the existing numeric schema constraint', () => {
    const schema = readFileSync(new URL('./schema/risk.ts', import.meta.url), 'utf8')
    expect(schema).toContain("versionCheck: check('risk_templates_version_check'")
    expect(schema).toContain("'^[0-9]+\\\\.[0-9]+$'")
    expect(RISK_CATALOGUE).toHaveLength(50)
    expect(
      RISK_CATALOGUE.every((row) => row.version === '1.0-draft' && row.adoptionStatus === 'draft'),
    ).toBe(true)
    expect(RISK_CATALOGUE_TEMPLATES.every((row) => /^[0-9]+\.[0-9]+$/.test(row.version))).toBe(true)
    expect(
      RISK_CATALOGUE_TEMPLATES.filter((row) => row.version === '1.1').map((row) => row.id),
    ).toEqual([riskCatalogueId('RA-002')])
    expect(RISK_CATALOGUE_TEMPLATES.flatMap((row) => row.hazards)).toHaveLength(100)
  })
})

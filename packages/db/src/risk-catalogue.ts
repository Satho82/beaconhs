import catalogue from './risk-catalogue.json'
import { canonicalRiskMatrixSnapshot } from './risk-matrix'
import type { riskTemplates } from './schema/risk'
import { PLATFORM_RISK_TEMPLATE_OWNER } from './risk-library'

/** Decision 15 topic identities. Guidance is a starting point, never an approval. */
export const RISK_CATALOGUE = catalogue
export const RISK_CATALOGUE_CATEGORIES = [
  'GENERAL HOTEL OPERATIONS',
  'FIRE, EMERGENCY AND SECURITY',
  'HOUSEKEEPING AND ACCOMMODATION',
  'MAINTENANCE, PLANT AND ENGINEERING',
  'GUEST SERVICES AND PUBLIC AREAS',
  'SPECIALIST OPERATIONS AND EXTERNAL AREAS',
] as const

// Display categories do not change the existing PostgreSQL enum.
const storageCategories = [
  'hotel_general',
  'general',
  'housekeeping',
  'engineering',
  'front_of_house',
  'leisure',
] as const

/** Fixed namespace plus approved reference number, independent of order or title. */
export function riskCatalogueId(reference: string): string {
  if (!/^RA-0(?:[0-4][0-9]|50)$/.test(reference) || reference === 'RA-000')
    throw new Error('Unknown approved Risk catalogue reference')
  return `983265d8-4197-5a14-a701-${Number(reference.slice(3)).toString(16).padStart(12, '0')}`
}

/**
 * Database version keys must satisfy the existing numeric constraint and unique
 * title/version index. RA-002 uses 1.1 only to coexist with the retained legacy
 * 1.0 row. This is a storage key, not a content revision or successor claim.
 */
export function riskCataloguePersistedVersion(item: (typeof RISK_CATALOGUE)[number]): string {
  if (item.reference === 'RA-002') return '1.1'
  return item.version.replace(/-draft$/, '')
}

export function riskCatalogueMetadata(template: { id: string; version: string; scope: string }) {
  if (template.scope !== 'platform') return undefined
  return RISK_CATALOGUE.find(
    (item) =>
      riskCatalogueId(item.reference) === template.id &&
      riskCataloguePersistedVersion(item) === template.version,
  )
}

/** Map guidance into the existing persistence contract; no synthetic rows in the UI. */
export const RISK_CATALOGUE_TEMPLATES = RISK_CATALOGUE.map((item) => {
  const categoryIndex = RISK_CATALOGUE_CATEGORIES.findIndex(
    (category) => category === item.category,
  )
  const category = storageCategories[categoryIndex]
  if (!category) throw new Error(`Unknown catalogue category for ${item.reference}`)
  return {
    id: riskCatalogueId(item.reference),
    templateFamilyId: riskCatalogueId(item.reference),
    matrixSnapshot: canonicalRiskMatrixSnapshot(),
    tenantId: null,
    ownerKey: PLATFORM_RISK_TEMPLATE_OWNER,
    scope: 'platform' as const,
    title: item.title,
    category,
    // Numeric storage keys satisfy the existing database contract. RA-002's 1.1
    // key exists only to coexist with the unchanged legacy 1.0 row. Source draft
    // version/provenance remains in metadata and guidance; it is not a revision.
    version: riskCataloguePersistedVersion(item),
    state: 'active' as const,
    description: `${item.reference} — ${item.scope}. Source catalogue version: ${item.version}. ${item.contentStatus}. ${item.provenance}. Applicable to: ${item.applicability.join(', ')}. Keywords: ${item.keywords.join(', ')}.`,
    areaGuidance:
      'Identify the property, locations and people covered; verify applicability before use.',
    activityEquipmentGuidance: item.scope,
    hazards: item.hazards.map((hazard) => ({
      hazard: hazard.hazard,
      harm: hazard.harm,
      peopleAtRisk: [...hazard.personsExposed],
      standardControls: [...hazard.existingControlsToVerify],
      ...hazard.scoringExamples['5x5'],
    })),
    peopleAtRiskGuidance: [...new Set(item.hazards.flatMap((hazard) => hazard.personsExposed))],
    standardControls: [
      ...new Set(item.hazards.flatMap((hazard) => hazard.existingControlsToVerify)),
    ],
    furtherActionGuidance: item.hazards
      .map(
        (hazard) =>
          `${hazard.hazard}: ${hazard.furtherControls.join(' ')} Suggested responsible role: ${hazard.suggestedResponsibleRole}. Assign a named person and target date where required.`,
      )
      .join('\n'),
    initialRiskGuidance: `Use the existing 5×5 methodology. ${item.scoringNote}`,
    residualRiskGuidance: item.scoringNote,
    reviewGuidance: `Suggested review interval: ${item.review.suggestedIntervalMonths} months. Review after: ${item.review.triggers.join('; ')}. Record the property assessor and approver. Adoption creates a draft, not a signed assessment.`,
  } satisfies typeof riskTemplates.$inferInsert
})

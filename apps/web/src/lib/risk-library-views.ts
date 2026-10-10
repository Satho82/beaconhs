import { riskCatalogueMetadata, RISK_CATALOGUE_CATEGORIES } from '@beaconhs/db'
import type { riskTemplates } from '@beaconhs/db/schema'
import { mergeHref, parseListParams, pickString } from './list-params'

export type RiskSearch = Record<string, string | string[] | undefined>
export type RiskView = 'templates' | 'assessments'

export function riskTemplateCategory(row: {
  id: string
  version: string
  scope: string
  category: string
}) {
  const metadata = riskCatalogueMetadata(row)
  if (metadata) return metadata.category
  const index =
    (
      {
        housekeeping: 2,
        engineering: 3,
        front_of_house: 4,
        kitchen: 4,
        catering: 4,
        restaurant: 4,
        leisure: 5,
        property: 5,
      } as Record<string, number>
    )[row.category] ?? 0
  return RISK_CATALOGUE_CATEGORIES[index]!
}

export function riskView(search: RiskSearch): RiskView {
  if (search.view === 'templates' || search.view === 'assessments') return search.view
  // Preserve previously shared template searches and due-review shortcuts.
  return !search.due &&
    !search.status &&
    !search.assessmentCategory &&
    (search.q || search.category)
    ? 'templates'
    : 'assessments'
}

export function riskViewHref(search: RiskSearch, view: RiskView) {
  return mergeHref('/hospitality/risk', search, { view, page: null, q: null })
}

export function riskPage<T>(rows: T[], search: RiskSearch) {
  const params = parseListParams(search, { sort: 'title', allowedSorts: ['title'], perPage: 10 })
  const page = Math.min(params.page, Math.max(1, Math.ceil(rows.length / params.perPage)))
  return {
    rows: rows.slice((page - 1) * params.perPage, page * params.perPage),
    page,
    perPage: params.perPage,
    total: rows.length,
  }
}

/** Show immutable source provenance, not an internal database coexistence key. */
export function riskAssessmentTemplateVersion(
  snapshot: {
    version: string
    description?: string | null
  } | null,
) {
  if (!snapshot) return 'Manual'
  return (
    snapshot.description?.match(
      /Source catalogue version: ([0-9]+\.[0-9]+(?:-[a-z]+)?)(?:\.|\s)/,
    )?.[1] ?? snapshot.version
  )
}

/** Presentation filtering only, after listRiskTemplates has enforced tenant scope. */
export function filterRiskTemplates(
  rows: (typeof riskTemplates.$inferSelect)[],
  search: RiskSearch,
) {
  const query = (pickString(search.q) ?? '').trim().toLowerCase()
  const owner = pickString(search.owner)
  const category = pickString(search.catalogueCategory)
  return rows
    .filter((row) => {
      const metadata = riskCatalogueMetadata(row)
      if (owner && owner !== 'all' && row.scope !== owner) return false
      if (category && riskTemplateCategory(row) !== category) return false
      if (search.category && row.category !== pickString(search.category)) return false
      const text = [row.title, row.description, metadata?.reference, ...(metadata?.keywords ?? [])]
        .join(' ')
        .toLowerCase()
      return !query || text.includes(query)
    })
    .sort((a, b) => {
      const aRef = riskCatalogueMetadata(a)?.reference
      const bRef = riskCatalogueMetadata(b)?.reference
      return (
        (aRef ?? `ZZ-${a.title}`).localeCompare(bRef ?? `ZZ-${b.title}`) ||
        a.version.localeCompare(b.version)
      )
    })
}

/** A URL preference is never a permission grant. Invalid scope fails closed. */
export function riskSelectedProperty(
  search: RiskSearch,
  context: { activePropertyId: string | null; properties: { id: string }[] },
) {
  const requested = pickString(search.property)
  if (requested === 'all') return null
  const selected = requested || context.activePropertyId
  if (selected && !context.properties.some((property) => property.id === selected))
    throw new Error('Risk assessment property is unavailable')
  return selected
}

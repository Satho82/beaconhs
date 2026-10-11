import { describe, expect, it } from 'vitest'
import { RISK_CATALOGUE_TEMPLATES, RISK_CATALOGUE_CATEGORIES } from '@beaconhs/db'
import type { riskTemplates } from '@beaconhs/db/schema'
import {
  filterRiskTemplates,
  riskPage,
  riskAssessmentTemplateVersion,
  riskSelectedProperty,
  riskView,
  riskViewHref,
} from './risk-library-views'

const templates: (typeof riskTemplates.$inferSelect)[] = RISK_CATALOGUE_TEMPLATES.map((row) => ({
  ...row,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}))

describe('module-local Risk library views', () => {
  it('shows source draft provenance rather than the RA-002 storage coexistence key', () => {
    expect(
      riskAssessmentTemplateVersion({
        version: '1.1',
        description:
          'RA-002 — Hotel. Source catalogue version: 1.0-draft. guidance draft for competent review.',
      }),
    ).toBe('1.0-draft')
    expect(riskAssessmentTemplateVersion({ version: '1.0', description: 'Legacy snapshot' })).toBe(
      '1.0',
    )
    expect(riskAssessmentTemplateVersion({ version: '1.0' })).toBe('1.0')
  })
  it('honours explicit tabs and preserves existing entry/search/review links', () => {
    expect(riskView({})).toBe('assessments')
    expect(riskView({ q: 'slips' })).toBe('templates')
    expect(riskView({ due: 'due' })).toBe('assessments')
    expect(riskView({ view: 'assessments', q: 'slips' })).toBe('assessments')
    expect(riskView({ view: 'templates', due: 'due' })).toBe('templates')
    const url = new URL(
      riskViewHref({ property: 'a', due: 'due', page: '4', q: 'old' }, 'templates'),
      'http://localhost',
    )
    expect(url.searchParams.get('view')).toBe('templates')
    expect(url.searchParams.get('property')).toBe('a')
    expect(url.searchParams.get('due')).toBe('due')
    expect(url.searchParams.has('page')).toBe(false)
    expect(url.searchParams.has('q')).toBe(false)
  })
  it.each([
    ['RA-050', 'Communicable Diseases and Infection Control'],
    ['slips, trips', 'Slips, Trips and Falls'],
    ['induction', 'General Workplace Health & Safety'],
  ])('finds %s by reference, title or keyword', (q, title) => {
    expect(filterRiskTemplates(templates, { q }).map((row) => row.title)).toContain(title)
  })
  it('combines owner/category/search and supports existing category URLs', () => {
    const tenant = {
      ...templates[0]!,
      id: 'tenant-template',
      scope: 'tenant' as const,
      tenantId: 'tenant-a',
      category: 'housekeeping' as const,
    }
    expect(
      filterRiskTemplates([...templates, tenant], {
        owner: 'tenant',
        catalogueCategory: RISK_CATALOGUE_CATEGORIES[2],
      }),
    ).toEqual([tenant])
    expect(
      filterRiskTemplates(templates, {
        owner: 'platform',
        catalogueCategory: RISK_CATALOGUE_CATEGORIES[0],
      }),
    ).toHaveLength(10)
    expect(
      filterRiskTemplates(templates, {
        catalogueCategory: RISK_CATALOGUE_CATEGORIES[2],
        q: 'RA-001',
      }),
    ).toHaveLength(0)
    expect(filterRiskTemplates(templates, { category: 'engineering' })).toHaveLength(10)
  })
  it('paginates all 50 without duplicates and clamps invalid/out-of-range pages', () => {
    const ids = Array.from({ length: 5 }, (_, i) =>
      riskPage(templates, { page: String(i + 1) }).rows.map((row) => row.id),
    ).flat()
    expect(ids).toEqual(templates.map((row) => row.id))
    expect(riskPage(templates, { page: '999' }).page).toBe(5)
    expect(riskPage(templates, { page: 'bad' }).page).toBe(1)
    expect(riskPage(templates, { perPage: '50' }).rows).toHaveLength(50)
    expect(riskPage([], { page: '4' }).rows).toEqual([])
  })
  it('selects only an authorised property; missing selection never means portfolio', () => {
    const context = { activePropertyId: 'property-a', properties: [{ id: 'property-a' }] }
    expect(riskSelectedProperty({}, context)).toBe('property-a')
    expect(riskSelectedProperty({ property: 'property-a' }, context)).toBe('property-a')
    expect(() => riskSelectedProperty({ property: 'property-b' }, context)).toThrow('unavailable')
    expect(riskSelectedProperty({}, { ...context, activePropertyId: null })).toBeNull()
    expect(
      riskSelectedProperty(
        { property: 'all' },
        {
          activePropertyId: 'property-a',
          properties: [{ id: 'property-a' }, { id: 'property-b' }],
        },
      ),
    ).toBeNull()
  })
})

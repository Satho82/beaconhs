import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MODULE_ADMIN } from './module-admin/registry'
import { NAV_MODULES } from './nav/registry'

const app = resolve(import.meta.dirname, '../app/(app)')
const read = (path: string) => readFileSync(resolve(app, path), 'utf8')

describe('retired Hazard Assessments module', () => {
  it('removes legacy module administration and navigation surfaces', () => {
    expect(MODULE_ADMIN.some((module) => module.moduleKey === 'hazid')).toBe(false)
    expect(NAV_MODULES.some((module) => module.key === 'hazid')).toBe(false)
  })

  it('redirects old route entry points to the Risk Assessments module', () => {
    expect(read('hazard-assessments/layout.tsx')).toContain("redirect('/hospitality/risk')")
    expect(read('my/hazard-assessments/page.tsx')).toContain(
      "redirect('/hospitality/risk?view=assessments')",
    )
  })

  it('removes stale Hazard Assessments links from global search, dashboard and activity feed', () => {
    expect(
      readFileSync(resolve(import.meta.dirname, '../components/global-search.tsx'), 'utf8'),
    ).not.toContain('hazid_assessments')
    expect(
      readFileSync(resolve(import.meta.dirname, '../app/api/search/route.ts'), 'utf8'),
    ).not.toContain('hazidAssessments')
    expect(readFileSync(resolve(app, 'dashboard/_metrics.ts'), 'utf8')).not.toContain(
      'hazidAssessments',
    )
    expect(readFileSync(resolve(app, 'feed/_data.ts'), 'utf8')).not.toContain('hazidAssessments')
  })

  it('keeps historical HazID storage intact', () => {
    const migrations = resolve(import.meta.dirname, '../../../../packages/db/drizzle/prepared')
    for (const name of [
      '0059_risk_template_draft_state.sql',
      '0060_risk_template_families_manual_assessments.sql',
      '0061_risk_assessment_revisions_archive_signoffs.sql',
    ]) {
      expect(readFileSync(resolve(migrations, name), 'utf8')).not.toMatch(
        /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?hazid_/i,
      )
    }
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('shared module property integration', () => {
  it.each([
    '../app/(app)/corrective-actions/page.tsx',
    '../app/(app)/corrective-actions/export.csv/route.ts',
    '../app/(app)/corrective-actions/reports/aging/page.tsx',
    '../app/(app)/corrective-actions/reports/by-assignee/page.tsx',
    '../app/(app)/corrective-actions/reports/by-source/page.tsx',
    '../app/(app)/corrective-actions/reports/overdue/page.tsx',
    '../app/(app)/incidents/export.csv/route.ts',
  ])('narrows %s using resolved property context inside the read transaction', (path) => {
    const text = source(path)
    expect(text).toContain('await resolveHospitalityPropertyContext(ctx)')
    const transaction = text.indexOf('await ctx.db(async (tx) => {')
    const narrowing = text.indexOf(
      'await applyActiveHospitalityPropertyScope(ctx, tx, propertyContext.activePropertyId)',
    )
    const visibility = text.indexOf('await moduleScopeWhere(ctx, tx,')
    expect(transaction).toBeGreaterThan(-1)
    expect(narrowing).toBeGreaterThan(transaction)
    expect(visibility).toBeGreaterThan(narrowing)
  })

  it.each([
    ['../app/(app)/corrective-actions/_actions.ts', 'canReadEvidenceAttachment'],
    ['../app/(app)/incidents/[id]/page.tsx', 'assertCanUseEvidenceAttachments'],
    ['./hospitality/handover.ts', 'assertCanUseEvidenceAttachments'],
    ['./hospitality/maintenance.ts', 'assertCanUseEvidenceAttachments'],
  ])('keeps %s connected to the shared parent authorization guard', (path, guard) => {
    expect(source(path)).toContain(`await ${guard}(ctx,`)
    expect(source(path)).toContain("from '@/lib/attachment-evidence-access'")
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const metering = readFileSync(
  new URL('../app/(app)/hospitality/metering/page.tsx', import.meta.url),
  'utf8',
)
const actionPrint = readFileSync(
  new URL('../app/(app)/corrective-actions/[id]/print/page.tsx', import.meta.url),
  'utf8',
)
const actionReport = readFileSync(
  new URL('../app/(app)/corrective-actions/reports/by-source/page.tsx', import.meta.url),
  'utf8',
)

describe('V1.4 tenant currency defaults', () => {
  it('uses the tenant resolver for new metering tariffs', () => {
    expect(metering).toContain('resolveTenantOperationalDefaultsForContext(ctx)')
    expect(metering).toContain('defaultValue={operationalDefaults.currencyCode}')
    expect(metering).not.toContain('defaultValue="GBP"')
  })

  it('uses tenant currency only where corrective-action records have no snapshot', () => {
    for (const source of [actionPrint, actionReport]) {
      expect(source).toContain('operationalDefaults.currencyCode')
      expect(source).not.toContain("currency: 'USD'")
    }
  })
})

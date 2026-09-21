import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { escapeRiskReport } from './risk-reporting'

const source = readFileSync(resolve(import.meta.dirname, 'risk-reporting.ts'), 'utf8')
const assessmentRoute = readFileSync(
  resolve(
    import.meta.dirname,
    '../app/(app)/hospitality/risk/assessments/[assessmentId]/pdf/route.ts',
  ),
  'utf8',
)

describe('Risk reporting foundation', () => {
  it('escapes report-authored text before rendering HTML', () => {
    expect(escapeRiskReport('<script>"x"&</script>')).toBe(
      '&lt;script&gt;&quot;x&quot;&amp;&lt;/script&gt;',
    )
  })

  it('renders adopted snapshot provenance and complete risk content', () => {
    expect(source).toContain('adoptedTemplateSnapshot')
    expect(source).toContain('snapshot.title')
    expect(source).toContain('snapshot.version')
    expect(source).toContain('initialScore')
    expect(source).toContain('residualScore')
    expect(source).toContain('correctiveActions')
    expect(source).toContain('riskAssessmentSignoffs')
    expect(source).toContain('historicalSignoff.snapshot')
    expect(source).toContain('signedSnapshot?.hazards')
    expect(assessmentRoute).toContain("searchParams.get('signoffId')")
  })

  it('uses dynamic platform, customer and property branding data', () => {
    expect(source).toContain('getPlatformBranding()')
    expect(source).toContain('tenant?.branding.logoUrl')
    expect(source).toContain('property.address')
    expect(source).not.toMatch(/Cycas|Vertiq|Navitas/i)
  })

  it('uses the established on-demand PDF pipeline and audits exports', () => {
    expect(assessmentRoute).toContain('renderOnDemandPdfResponse')
    expect(assessmentRoute).toContain("action: 'export'")
    expect(assessmentRoute).toContain("entityType: 'risk_assessment'")
  })

  it('builds tenant and property-authorized register CSV data', () => {
    expect(source).toContain("assertCan(ctx, 'hospitality.read')")
    expect(source).toContain('assertCanAccessProperty(ctx, propertyId)')
    expect(source).toContain('hospitalityPropertyWhere(ctx, riskAssessments.propertyId)')
    expect(source).toContain("'Reference'")
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  escapeRiskCsv,
  escapeRiskReport,
  formatRiskRegisterCsv,
  parseRiskRegisterCsv,
} from './risk-reporting'
import { canonicalRiskMatrixSnapshot } from '@beaconhs/db/risk-matrix'

const source = readFileSync(resolve(import.meta.dirname, 'risk-reporting.ts'), 'utf8')
const assessmentRoute = readFileSync(
  resolve(
    import.meta.dirname,
    '../app/(app)/hospitality/risk/assessments/[assessmentId]/pdf/route.ts',
  ),
  'utf8',
)
const csvRoute = readFileSync(
  resolve(import.meta.dirname, '../app/(app)/hospitality/risk/export.csv/route.ts'),
  'utf8',
)

describe('Risk reporting foundation', () => {
  it('escapes report-authored text before rendering HTML', () => {
    expect(escapeRiskReport('<script>"x"&</script>')).toBe(
      '&lt;script&gt;&quot;x&quot;&amp;&lt;/script&gt;',
    )
  })

  it('escapes CSV delimiters and neutralizes spreadsheet formulas', () => {
    expect(escapeRiskCsv('Lobby, "west"')).toBe('"Lobby, ""west"""')
    expect(escapeRiskCsv('=SUM(A1:A2)')).toBe('"\'=SUM(A1:A2)"')
    expect(escapeRiskCsv('-1+1')).toBe('"\'-1+1"')
  })

  it('parses BOM-prefixed register exports with quoted commas and quotes', () => {
    const sourceCsv =
      String.fromCharCode(65279) +
      ['"Property","People at risk"', '"Room, west","Guests, ""staff"""'].join(
        String.fromCharCode(13) + String.fromCharCode(10),
      )
    expect(parseRiskRegisterCsv(sourceCsv)).toEqual([
      ['Property', 'People at risk'],
      ['Room, west', 'Guests, "staff"'],
    ])
  })

  it('formats real register rows with headers, UTF-8 BOM, escaping and canonical ratings', () => {
    const csv = formatRiskRegisterCsv([
      {
        assessment: {
          reference: 'RA-CSV-01',
          assessmentCategory: 'kitchen',
          matrixSnapshot: canonicalRiskMatrixSnapshot(),
          title: '=Kitchen, "west"',
          adoptedTemplateSnapshot: {
            templateId: 'template-a',
            version: '1.0',
            title: 'Kitchen fire controls',
            category: 'kitchen',
            description: 'Fire safety',
            areaGuidance: null,
            activityEquipmentGuidance: null,
            hazards: [],
            peopleAtRiskGuidance: [],
            standardControls: [],
            furtherActionGuidance: null,
            initialRiskGuidance: null,
            residualRiskGuidance: null,
            reviewGuidance: null,
          },
          status: 'active',
          nextReviewDate: '2026-11-01',
          reminderLeadDays: 30,
          effectiveDate: '2026-10-01',
        },
        property: { name: 'Hotel, West' },
        residualScore: 12,
        peopleAtRisk: ['Employees', 'Guests'],
      },
    ])
    const parsed = parseRiskRegisterCsv(csv)
    expect(csv.charCodeAt(0)).toBe(65279)
    expect(csv).toContain('\r\n')
    expect(parsed[0]).toEqual([
      'Reference',
      'Assessment',
      'Property',
      'Category',
      'Template version',
      'Status',
      'People at risk',
      'Residual score',
      'Residual rating',
      'Effective date',
      'Next review',
    ])
    expect(parsed[1]).toEqual([
      'RA-CSV-01',
      '\'=Kitchen, "west"',
      'Hotel, West',
      'kitchen',
      '1.0',
      'due_soon',
      'Employees, Guests',
      '12',
      'High',
      '2026-10-01',
      '2026-11-01',
    ])
  })

  it('renders adopted snapshot provenance and complete risk content', () => {
    expect(source).toContain('adoptedTemplateSnapshot')
    expect(source).toContain('snapshot.title')
    expect(source).toContain('riskAssessmentTemplateVersion(snapshot)')
    expect(source).toContain('initialScore')
    expect(source).toContain('residualScore')
    expect(source).toContain('correctiveActions')
    expect(source).toContain('riskAssessmentSignoffs')
    expect(source).toContain('peopleAtRisk.join')
    expect(source).toContain('buildRiskRegisterHtml')
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
    expect(csvRoute).toContain("Content-Disposition': 'attachment; filename=\"risk-register.csv\"'")
    expect(csvRoute).toContain("Content-Type': 'text/csv; charset=utf-8'")
    expect(csvRoute).toContain("action: 'export'")
  })
})

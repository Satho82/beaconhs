import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  correctiveActions,
  hospitalityProperties,
  riskAssessments,
  riskAssessmentSignoffs,
  riskHazards,
  tenantUsers,
  tenants,
  users,
} from '@beaconhs/db/schema'
import { riskRatingForAssessmentScore } from '@/lib/risk-assessment-matrix'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import {
  assertCanAccessProperty,
  hospitalityPropertyWhere,
} from '@/lib/hospitality/property-access'
import { getPlatformBranding } from '@/lib/platform-branding-config'
import { riskLifecycleStatus } from '@/lib/risk-lifecycle'
import { riskAssessmentTemplateVersion } from '@/lib/risk-library-views'

export function escapeRiskReport(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
export function escapeRiskCsv(value: unknown): string {
  const raw = String(value ?? '')
  const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? "'" + raw : raw
  return `"${safe.replaceAll('"', '""')}"`
}
function contactValue(settings: Record<string, unknown>, key: string): string {
  const value = settings[key]
  return typeof value === 'string' ? value : ''
}

export async function loadRiskReport(ctx: RequestContext, assessmentId: string) {
  assertCan(ctx, 'hospitality.read')
  return ctx.db(async (tx) => {
    const [head] = await tx
      .select({
        assessment: riskAssessments,
        property: hospitalityProperties,
        tenant: tenants,
        assessorName: users.name,
        assessorDisplayName: tenantUsers.displayName,
      })
      .from(riskAssessments)
      .innerJoin(
        hospitalityProperties,
        and(
          eq(hospitalityProperties.tenantId, riskAssessments.tenantId),
          eq(hospitalityProperties.id, riskAssessments.propertyId),
        ),
      )
      .innerJoin(tenants, eq(tenants.id, riskAssessments.tenantId))
      .innerJoin(
        tenantUsers,
        and(
          eq(tenantUsers.tenantId, riskAssessments.tenantId),
          eq(tenantUsers.id, riskAssessments.assessorTenantUserId),
        ),
      )
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(
        and(
          eq(riskAssessments.tenantId, ctx.tenantId),
          eq(riskAssessments.id, assessmentId),
          isNull(riskAssessments.deletedAt),
        ),
      )
      .limit(1)
    if (!head) return null
    assertCanAccessProperty(ctx, head.assessment.propertyId)
    const [hazards, signoffs] = await Promise.all([
      tx
        .select()
        .from(riskHazards)
        .where(
          and(eq(riskHazards.tenantId, ctx.tenantId), eq(riskHazards.assessmentId, assessmentId)),
        )
        .orderBy(asc(riskHazards.sortOrder)),
      tx
        .select()
        .from(riskAssessmentSignoffs)
        .where(
          and(
            eq(riskAssessmentSignoffs.tenantId, ctx.tenantId),
            eq(riskAssessmentSignoffs.assessmentId, assessmentId),
          ),
        )
        .orderBy(asc(riskAssessmentSignoffs.signedAt)),
    ])
    const hazardIds = hazards.map((hazard) => hazard.id)
    const actions =
      hazardIds.length === 0
        ? []
        : await tx
            .select({
              action: correctiveActions,
              ownerName: users.name,
              ownerDisplayName: tenantUsers.displayName,
            })
            .from(correctiveActions)
            .innerJoin(
              tenantUsers,
              and(
                eq(tenantUsers.tenantId, correctiveActions.tenantId),
                eq(tenantUsers.id, correctiveActions.ownerTenantUserId),
              ),
            )
            .innerJoin(users, eq(users.id, tenantUsers.userId))
            .where(
              and(
                eq(correctiveActions.tenantId, ctx.tenantId),
                eq(correctiveActions.sourceEntityType, 'risk_hazard'),
                inArray(correctiveActions.sourceEntityId, hazardIds),
                isNull(correctiveActions.deletedAt),
              ),
            )
    return { ...head, hazards, signoffs, actions }
  })
}

export async function riskReportBranding(ctx: RequestContext) {
  const [platform, tenant] = await Promise.all([
    getPlatformBranding(),
    ctx.db(async (tx) => {
      const [row] = await tx.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1)
      return row
    }),
  ])
  return {
    platformName: platform.productName || 'Uvanoo',
    platformLogoUrl: platform.logoUrl || null,
    platformSupport: platform.email?.supportEmail || platform.email?.footer || '',
    customerName: tenant?.name || '',
    customerLogoUrl: tenant?.branding.logoUrl || null,
    customerEmail: tenant ? contactValue(tenant.settings, 'email') : '',
    customerPhone: tenant ? contactValue(tenant.settings, 'telephone') : '',
    customerWebsite: tenant ? contactValue(tenant.settings, 'website') : '',
  }
}

function logo(url: string | null, text: string, align: string) {
  return url
    ? `<img src="${escapeRiskReport(url)}" alt="${escapeRiskReport(text)}" style="max-height:48px;max-width:190px;object-fit:contain;float:${align}">`
    : `<strong style="font-size:22px;float:${align}">${escapeRiskReport(text)}</strong>`
}
const cell = 'border:1px solid #cbd5e1;padding:5px 7px;vertical-align:top;font-size:10px;'
const head = `${cell}background:#e2e8f0;font-weight:700;`

export async function buildRiskAssessmentHtml(
  ctx: RequestContext,
  assessmentId: string,
  signoffId?: string,
) {
  const [report, branding] = await Promise.all([
    loadRiskReport(ctx, assessmentId),
    riskReportBranding(ctx),
  ])
  if (!report) return null
  const historicalSignoff = signoffId
    ? report.signoffs.find((signoff) => signoff.id === signoffId)
    : null
  if (signoffId && (!historicalSignoff || !historicalSignoff.snapshot)) return null
  const signedSnapshot = historicalSignoff?.snapshot
  const a = signedSnapshot?.assessment ?? report.assessment
  const snapshot = a.adoptedTemplateSnapshot
  const savedMatrix = signedSnapshot ? signedSnapshot.matrix : report.assessment.matrixSnapshot
  const rating = (score: number) =>
    savedMatrix ? riskRatingForAssessmentScore(score, savedMatrix) : 'Historical matrix unknown'
  const hazards = signedSnapshot?.hazards ?? report.hazards
  const hazardRows = hazards
    .map(
      (hazard) => `<tr>
    <td style="${cell}">${escapeRiskReport(hazard.hazardDescription)}${hazard.archivedAt ? ' (Archived)' : ''}<br><small>${escapeRiskReport(hazard.harmDescription)}</small></td>
    <td style="${cell}">${escapeRiskReport(hazard.peopleAtRisk.join(', '))}</td>
    <td style="${cell}">${hazard.initialLikelihood} × ${hazard.initialSeverity} = ${hazard.initialScore}<br>${rating(hazard.initialScore)}</td>
    <td style="${cell}">${escapeRiskReport(hazard.controls)}</td>
    <td style="${cell}">${escapeRiskReport(hazard.additionalControls || '')}</td>
    <td style="${cell}">${hazard.residualLikelihood} × ${hazard.residualSeverity} = ${hazard.residualScore}<br>${rating(hazard.residualScore)}</td>
  </tr>`,
    )
    .join('')
  const actionRows = (signedSnapshot ? [] : report.actions)
    .map(
      ({ action, ownerName, ownerDisplayName }) => `<tr>
    <td style="${cell}">${escapeRiskReport(action.title)}</td><td style="${cell}">${escapeRiskReport(ownerDisplayName || ownerName)}</td>
    <td style="${cell}">${escapeRiskReport(action.severity)}</td><td style="${cell}">${escapeRiskReport(action.dueOn)}</td>
    <td style="${cell}">${escapeRiskReport(action.status)}</td></tr>`,
    )
    .join('')
  const signoffRows = report.signoffs
    .map(
      (signoff) => `<tr>
    <td style="${cell}">${escapeRiskReport(signoff.signedByName)}</td><td style="${cell}">${escapeRiskReport(signoff.signedByRole)}</td>
    <td style="${cell}">${escapeRiskReport(signoff.action)}</td><td style="${cell}">${escapeRiskReport(signoff.signedAt.toISOString())}</td>
    <td style="${cell}">${escapeRiskReport(signoff.comments || '')}</td><td style="${cell}">v${signoff.lifecycleVersion}</td></tr>`,
    )
    .join('')
  const lifecycle = riskLifecycleStatus({
    storedStatus: a.status,
    nextReviewDate: a.nextReviewDate,
    reminderLeadDays: a.reminderLeadDays,
  })
  const property = signedSnapshot?.property ?? report.property
  const tenant = signedSnapshot?.tenant ?? report.tenant
  const assessorName =
    signedSnapshot?.assessorName || report.assessorDisplayName || report.assessorName
  const address = Object.values(property.address || {})
    .filter((value) => typeof value === 'string')
    .join(', ')
  return `<div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#0f172a">
    <header style="height:58px;border-bottom:2px solid #0f172a;margin-bottom:14px">
      ${logo(branding.platformLogoUrl, branding.platformName, 'left')}
      ${logo(branding.customerLogoUrl, branding.customerName, 'right')}
    </header>
    <h1 style="font-size:20px;margin:0">Risk Assessment ${escapeRiskReport(a.reference)}</h1>
    <p style="font-size:11px;color:#475569">${escapeRiskReport(tenant.name)} · ${escapeRiskReport(property.name)} · ${escapeRiskReport(address)}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tbody>
      <tr><th style="${head}">Title</th><td style="${cell}">${escapeRiskReport(a.title)}</td><th style="${head}">Category</th><td style="${cell}">${escapeRiskReport(a.assessmentCategory ?? snapshot?.category ?? '')}</td></tr>
      <tr><th style="${head}">Template</th><td style="${cell}">${snapshot ? escapeRiskReport(snapshot.title) + ' v' + escapeRiskReport(riskAssessmentTemplateVersion(snapshot)) : 'Manual assessment'}</td><th style="${head}">Assessment date</th><td style="${cell}">${a.assessmentDate}</td></tr>
      <tr><th style="${head}">Area</th><td style="${cell}">${escapeRiskReport(a.areaLocation)}</td><th style="${head}">Activity / equipment</th><td style="${cell}">${escapeRiskReport(a.activityEquipment)}</td></tr>
      <tr><th style="${head}">Assessor</th><td style="${cell}">${escapeRiskReport(assessorName)}</td><th style="${head}">Lifecycle</th><td style="${cell}">${lifecycle}</td></tr>
      <tr><th style="${head}">Effective</th><td style="${cell}">${escapeRiskReport(a.effectiveDate)}</td><th style="${head}">Next review</th><td style="${cell}">${escapeRiskReport(a.nextReviewDate)} · ${a.validityMonths ? `${a.validityMonths} months` : 'custom'}</td></tr>
    </tbody></table>
    <h2 style="font-size:14px">Hazards, controls and residual risk</h2>
    <table style="width:100%;border-collapse:collapse"><thead><tr><th style="${head}">Hazard / harm</th><th style="${head}">People at risk</th><th style="${head}">Initial risk</th><th style="${head}">Existing controls / SSoW</th><th style="${head}">Further actions</th><th style="${head}">Residual risk</th></tr></thead><tbody>${hazardRows}</tbody></table>
    <h2 style="font-size:14px">Corrective actions</h2>
    <table style="width:100%;border-collapse:collapse"><thead><tr><th style="${head}">Action</th><th style="${head}">Owner</th><th style="${head}">Priority</th><th style="${head}">Due</th><th style="${head}">Status</th></tr></thead><tbody>${actionRows || `<tr><td style="${cell}" colspan="5">None</td></tr>`}</tbody></table>
    <h2 style="font-size:14px">Immutable sign-off and version history</h2>
    <table style="width:100%;border-collapse:collapse"><thead><tr><th style="${head}">Manager</th><th style="${head}">Role</th><th style="${head}">Action</th><th style="${head}">Date/time</th><th style="${head}">Comments</th><th style="${head}">Review version</th></tr></thead><tbody>${signoffRows}</tbody></table>
    <footer style="margin-top:16px;border-top:1px solid #cbd5e1;padding-top:8px;font-size:9px;color:#64748b">
      ${escapeRiskReport(branding.platformSupport)} · ${escapeRiskReport(branding.customerEmail)} · ${escapeRiskReport(branding.customerPhone)} · ${escapeRiskReport(branding.customerWebsite)}
      <br>Source: ${snapshot ? escapeRiskReport(snapshot.title) + ' v' + escapeRiskReport(riskAssessmentTemplateVersion(snapshot)) : 'Manual assessment'}
    </footer></div>`
}

export async function buildRiskRegisterCsv(ctx: RequestContext, propertyId?: string) {
  assertCan(ctx, 'hospitality.read')
  if (propertyId) assertCanAccessProperty(ctx, propertyId)
  const rows = await ctx.db((tx) =>
    tx
      .select({
        assessment: riskAssessments,
        property: hospitalityProperties,
        residualScore: sql<number>`max(${riskHazards.residualScore})`,
        peopleAtRisk: sql<
          string[]
        >`coalesce((SELECT array_agg(DISTINCT person.value) FROM risk_hazards people_hazard CROSS JOIN LATERAL jsonb_array_elements_text(people_hazard.people_at_risk) person(value) WHERE people_hazard.tenant_id = ${riskAssessments.tenantId} AND people_hazard.assessment_id = ${riskAssessments.id} AND people_hazard.archived_at IS NULL), ARRAY[]::text[])`,
      })
      .from(riskAssessments)
      .innerJoin(
        hospitalityProperties,
        and(
          eq(hospitalityProperties.tenantId, riskAssessments.tenantId),
          eq(hospitalityProperties.id, riskAssessments.propertyId),
        ),
      )
      .leftJoin(
        riskHazards,
        and(
          eq(riskHazards.tenantId, riskAssessments.tenantId),
          eq(riskHazards.assessmentId, riskAssessments.id),
          isNull(riskHazards.archivedAt),
        ),
      )
      .where(
        and(
          eq(riskAssessments.tenantId, ctx.tenantId),
          isNull(riskAssessments.deletedAt),
          propertyId
            ? eq(riskAssessments.propertyId, propertyId)
            : hospitalityPropertyWhere(ctx, riskAssessments.propertyId),
        ),
      )
      .groupBy(riskAssessments.id, hospitalityProperties.id)
      .orderBy(asc(hospitalityProperties.name), asc(riskAssessments.reference)),
  )
  return formatRiskRegisterCsv(rows)
}

type RiskRegisterCsvRow = {
  assessment: Pick<
    typeof riskAssessments.$inferSelect,
    | 'reference'
    | 'title'
    | 'adoptedTemplateSnapshot'
    | 'assessmentCategory'
    | 'matrixSnapshot'
    | 'status'
    | 'nextReviewDate'
    | 'reminderLeadDays'
    | 'effectiveDate'
  >
  property: Pick<typeof hospitalityProperties.$inferSelect, 'name'>
  residualScore: number | null
  peopleAtRisk: string[] | null
}

export function formatRiskRegisterCsv(rows: readonly RiskRegisterCsvRow[]) {
  return (
    '\uFEFF' +
    [
      [
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
      ]
        .map(escapeRiskCsv)
        .join(','),
      ...rows.map(({ assessment, property, residualScore, peopleAtRisk }) =>
        [
          assessment.reference,
          assessment.title,
          property.name,
          assessment.assessmentCategory,
          riskAssessmentTemplateVersion(assessment.adoptedTemplateSnapshot),
          riskLifecycleStatus({
            storedStatus: assessment.status,
            nextReviewDate: assessment.nextReviewDate,
            reminderLeadDays: assessment.reminderLeadDays,
          }),
          (peopleAtRisk ?? []).join(', '),
          residualScore || '',
          residualScore
            ? assessment.matrixSnapshot
              ? riskRatingForAssessmentScore(Number(residualScore), assessment.matrixSnapshot)
              : 'Historical matrix unknown'
            : '',
          assessment.effectiveDate || '',
          assessment.nextReviewDate || '',
        ]
          .map(escapeRiskCsv)
          .join(','),
      ),
    ].join('\r\n')
  )
}

export function parseRiskRegisterCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 65279 ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field.length === 0) quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char.charCodeAt(0) === 10) {
      row.push(field.endsWith(String.fromCharCode(13)) ? field.slice(0, -1) : field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field || row.length) {
    row.push(field.endsWith(String.fromCharCode(13)) ? field.slice(0, -1) : field)
    rows.push(row)
  }
  return rows
}

export async function buildRiskRegisterHtml(ctx: RequestContext, propertyId?: string) {
  const [contents, branding] = await Promise.all([
    buildRiskRegisterCsv(ctx, propertyId),
    riskReportBranding(ctx),
  ])
  const rows = parseRiskRegisterCsv(contents)
  const headers = rows[0] ?? []
  const body = rows.slice(1)
  const headerCells = headers
    .map((value) => `<th style="${head}">${escapeRiskReport(value)}</th>`)
    .join('')
  const bodyRows = body
    .map(
      (row) =>
        `<tr>${headers
          .map((_, index) => `<td style="${cell}">${escapeRiskReport(row[index] ?? '')}</td>`)
          .join('')}</tr>`,
    )
    .join('')
  return `<div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#0f172a">
    <header style="height:58px;border-bottom:2px solid #0f172a;margin-bottom:14px">
      ${logo(branding.platformLogoUrl, branding.platformName, 'left')}
      ${logo(branding.customerLogoUrl, branding.customerName, 'right')}
    </header>
    <h1 style="font-size:20px">Risk Register</h1>
    <p style="font-size:11px;color:#475569">${escapeRiskReport(branding.customerName)}</p>
    <table style="width:100%;border-collapse:collapse"><thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows || `<tr><td style="${cell}" colspan="${Math.max(headers.length, 1)}">No assessments available</td></tr>`}</tbody>
    </table>
    <footer style="margin-top:16px;border-top:1px solid #cbd5e1;padding-top:8px;font-size:9px;color:#64748b">
      ${escapeRiskReport(branding.platformSupport)} · ${escapeRiskReport(branding.customerEmail)}
    </footer>
  </div>`
}

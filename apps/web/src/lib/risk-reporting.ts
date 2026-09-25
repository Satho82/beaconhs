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
import { riskRating } from '@beaconhs/db'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import {
  assertCanAccessProperty,
  hospitalityPropertyWhere,
} from '@/lib/hospitality/property-access'
import { getPlatformBranding } from '@/lib/platform-branding-config'
import { riskLifecycleStatus } from '@/lib/risk-lifecycle'

export function escapeRiskReport(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function csv(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
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
  const hazards = signedSnapshot?.hazards ?? report.hazards
  const hazardRows = hazards
    .map(
      (hazard) => `<tr>
    <td style="${cell}">${escapeRiskReport(hazard.hazardDescription)}<br><small>${escapeRiskReport(hazard.harmDescription)}</small></td>
    <td style="${cell}">${escapeRiskReport(hazard.peopleAtRisk.join(', '))}</td>
    <td style="${cell}">${hazard.initialLikelihood} × ${hazard.initialSeverity} = ${hazard.initialScore}<br>${riskRating(hazard.initialScore)}</td>
    <td style="${cell}">${escapeRiskReport(hazard.controls)}</td>
    <td style="${cell}">${escapeRiskReport(hazard.additionalControls || '')}</td>
    <td style="${cell}">${hazard.residualLikelihood} × ${hazard.residualSeverity} = ${hazard.residualScore}<br>${riskRating(hazard.residualScore)}</td>
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
      <tr><th style="${head}">Title</th><td style="${cell}">${escapeRiskReport(a.title)}</td><th style="${head}">Category</th><td style="${cell}">${escapeRiskReport(snapshot.category)}</td></tr>
      <tr><th style="${head}">Template</th><td style="${cell}">${escapeRiskReport(snapshot.title)} v${escapeRiskReport(a.adoptedTemplateVersion)}</td><th style="${head}">Assessment date</th><td style="${cell}">${a.assessmentDate}</td></tr>
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
      <br>Historical template snapshot: ${escapeRiskReport(snapshot.title)} v${escapeRiskReport(snapshot.version)}
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
  return [
    [
      'Reference',
      'Assessment',
      'Property',
      'Category',
      'Template version',
      'Status',
      'Residual score',
      'Residual rating',
      'Effective date',
      'Next review',
    ]
      .map(csv)
      .join(','),
    ...rows.map(({ assessment, property, residualScore }) =>
      [
        assessment.reference,
        assessment.title,
        property.name,
        assessment.adoptedTemplateSnapshot.category,
        assessment.adoptedTemplateVersion,
        riskLifecycleStatus({
          storedStatus: assessment.status,
          nextReviewDate: assessment.nextReviewDate,
          reminderLeadDays: assessment.reminderLeadDays,
        }),
        residualScore || '',
        residualScore ? riskRating(Number(residualScore)) : '',
        assessment.effectiveDate || '',
        assessment.nextReviewDate || '',
      ]
        .map(csv)
        .join(','),
    ),
  ].join('\r\n')
}

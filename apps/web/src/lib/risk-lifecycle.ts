import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm'
import {
  riskAssessments,
  riskAssessmentSignoffs,
  riskTemplates,
  roleAssignments,
  roles,
} from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { recordAuditInTransaction } from '@/lib/audit'
import { assertCanAccessProperty } from '@/lib/hospitality/property-access'

const RISK_VALIDITY_MONTHS = [3, 6, 12, 24] as const
export type RiskLifecycleAction = 'adopted' | 'reviewed' | 're_adopted' | 'amended' | 'retired'

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.valueOf()))
    throw new Error('A valid date is required')
  return date
}
function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, last))
  return result
}
export function calculateRiskReviewDates(input: {
  effectiveDate: string
  validityMonths?: number | null
  customReviewDate?: string | null
}) {
  const effective = parseDate(input.effectiveDate)
  if (input.customReviewDate) {
    const review = parseDate(input.customReviewDate)
    if (review <= effective) throw new Error('Review date must be after the effective date')
    return { nextReviewDate: isoDate(review), expiryDate: isoDate(review), validityMonths: null }
  }
  if (!RISK_VALIDITY_MONTHS.includes(input.validityMonths as 3 | 6 | 12 | 24))
    throw new Error('Select a supported validity period or a custom review date')
  const review = addMonths(effective, input.validityMonths!)
  return {
    nextReviewDate: isoDate(review),
    expiryDate: isoDate(review),
    validityMonths: input.validityMonths!,
  }
}
export function riskLifecycleStatus(input: {
  storedStatus: string
  nextReviewDate: string | null
  reminderLeadDays: number
  now?: Date
}) {
  if (input.storedStatus === 'draft' || input.storedStatus === 'retired') return input.storedStatus
  if (!input.nextReviewDate) return 'active'
  const today = parseDate(isoDate(input.now ?? new Date()))
  const review = parseDate(input.nextReviewDate)
  const days = Math.ceil((review.valueOf() - today.valueOf()) / 86_400_000)
  if (days < 0) return 'overdue'
  if (days === 0) return 'review_due'
  if (days <= input.reminderLeadDays) return 'due_soon'
  return 'active'
}
export function daysUntilRiskReview(nextReviewDate: string | null, now = new Date()) {
  if (!nextReviewDate) return null
  return Math.ceil(
    (parseDate(nextReviewDate).valueOf() - parseDate(isoDate(now)).valueOf()) / 86_400_000,
  )
}

export async function applyRiskLifecycleAction(
  ctx: RequestContext,
  assessmentId: string,
  input: {
    action: RiskLifecycleAction
    effectiveDate: string
    validityMonths?: number | null
    customReviewDate?: string | null
    reminderLeadDays: number
    comments?: string
  },
) {
  assertCan(ctx, 'hospitality.manage')
  const signerId = ctx.membership?.id
  if (!signerId) throw new Error('A tenant membership is required')
  if (
    !Number.isInteger(input.reminderLeadDays) ||
    input.reminderLeadDays < 1 ||
    input.reminderLeadDays > 365
  )
    throw new Error('Reminder lead time must be between 1 and 365 days')
  const dates = calculateRiskReviewDates(input)
  return ctx.db(async (tx) => {
    const [current] = await tx
      .select()
      .from(riskAssessments)
      .where(
        and(
          eq(riskAssessments.tenantId, ctx.tenantId),
          eq(riskAssessments.id, assessmentId),
          isNull(riskAssessments.deletedAt),
        ),
      )
      .limit(1)
      .for('update')
    if (!current) throw new Error('Risk assessment not found')
    assertCanAccessProperty(ctx, current.propertyId)
    if (current.status === 'retired' && input.action !== 're_adopted')
      throw new Error('A retired assessment can only be re-adopted')
    const lifecycleVersion = current.lifecycleVersion + (current.effectiveDate ? 1 : 0)
    const roleRows = await tx
      .select({ name: roles.name })
      .from(roleAssignments)
      .innerJoin(
        roles,
        and(eq(roles.tenantId, roleAssignments.tenantId), eq(roles.id, roleAssignments.roleId)),
      )
      .where(
        and(eq(roleAssignments.tenantId, ctx.tenantId), eq(roleAssignments.tenantUserId, signerId)),
      )
      .orderBy(asc(roles.name))
    const signedByRole = roleRows.map((row) => row.name).join(', ') || 'Hospitality manager'
    const status = input.action === 'retired' ? 'retired' : 'active'
    const [updated] = await tx
      .update(riskAssessments)
      .set({
        effectiveDate: input.effectiveDate,
        validityMonths: dates.validityMonths,
        nextReviewDate: dates.nextReviewDate,
        expiryDate: dates.expiryDate,
        reminderLeadDays: input.reminderLeadDays,
        lifecycleVersion,
        lastReminderReviewDate: null,
        status,
        updatedAt: new Date(),
      })
      .where(and(eq(riskAssessments.tenantId, ctx.tenantId), eq(riskAssessments.id, assessmentId)))
      .returning()
    if (!updated) throw new Error('Risk lifecycle update failed')
    const [signoff] = await tx
      .insert(riskAssessmentSignoffs)
      .values({
        tenantId: ctx.tenantId,
        propertyId: current.propertyId,
        assessmentId,
        signedByTenantUserId: signerId,
        signedByName: ctx.membership?.displayName || 'Manager',
        signedByRole,
        action: input.action,
        templateVersion: current.adoptedTemplateVersion,
        lifecycleVersion,
        validityMonths: dates.validityMonths,
        effectiveDate: input.effectiveDate,
        nextReviewDate: dates.nextReviewDate,
        comments: input.comments?.trim() || null,
      })
      .returning()
    if (!signoff) throw new Error('Risk sign-off failed')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_assessment',
      entityId: assessmentId,
      action: 'update',
      summary: `${input.action.replaceAll('_', ' ')} risk assessment ${current.reference}`,
      before: {
        status: current.status,
        lifecycleVersion: current.lifecycleVersion,
        nextReviewDate: current.nextReviewDate,
      },
      after: { status, lifecycleVersion, nextReviewDate: dates.nextReviewDate },
      metadata: { signoffId: signoff.id, propertyId: current.propertyId },
    })
    return { assessment: updated, signoff }
  })
}

export async function listRiskSignoffs(ctx: RequestContext, assessmentId: string) {
  assertCan(ctx, 'hospitality.read')
  const [assessment] = await ctx.db((tx) =>
    tx
      .select({ propertyId: riskAssessments.propertyId })
      .from(riskAssessments)
      .where(and(eq(riskAssessments.tenantId, ctx.tenantId), eq(riskAssessments.id, assessmentId)))
      .limit(1),
  )
  if (!assessment) throw new Error('Risk assessment not found')
  assertCanAccessProperty(ctx, assessment.propertyId)
  return ctx.db((tx) =>
    tx
      .select()
      .from(riskAssessmentSignoffs)
      .where(
        and(
          eq(riskAssessmentSignoffs.tenantId, ctx.tenantId),
          eq(riskAssessmentSignoffs.assessmentId, assessmentId),
        ),
      )
      .orderBy(desc(riskAssessmentSignoffs.signedAt)),
  )
}

export async function getNewerRiskTemplate(
  ctx: RequestContext,
  assessment: typeof riskAssessments.$inferSelect,
) {
  const title = assessment.adoptedTemplateSnapshot.title
  const candidates = await ctx.db((tx) =>
    tx
      .select()
      .from(riskTemplates)
      .where(
        and(
          eq(riskTemplates.title, title),
          eq(riskTemplates.state, 'active'),
          isNull(riskTemplates.deletedAt),
        ),
      ),
  )
  return (
    candidates
      .filter((row) => compareVersions(row.version, assessment.adoptedTemplateVersion) > 0)
      .sort((a, b) => compareVersions(b.version, a.version))[0] ?? null
  )
}
export function compareVersions(a: string, b: string) {
  const [a1, a2] = a.split('.').map(Number)
  const [b1, b2] = b.split('.').map(Number)
  return a1! - b1! || a2! - b2!
}

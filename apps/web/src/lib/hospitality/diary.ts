import { and, asc, eq, isNull, or } from 'drizzle-orm'
import {
  hospitalityProperties,
  operationalTaskOccurrences,
  operationalTaskSchedules,
  operationalTaskTemplates,
  correctiveActions,
  tenantUsers,
} from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { nextReference } from '@/lib/reference'
import { recordAudit } from '@/lib/audit'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'

export type DiaryRecurrence = 'daily' | 'weekly' | 'monthly'
export type DiaryTemplateInput = {
  title: string
  instructions?: string
  recurrence: DiaryRecurrence
  dueTime: string
  weekday?: string
  monthDay?: string
  timezone: string
  assigneeId?: string
}

function required(value: string, label: string): string {
  const clean = value.trim()
  if (!clean) throw new Error(`${label} is required.`)
  return clean
}

async function gate(ctx: RequestContext, write = false) {
  await assertTenantModuleEntitled(ctx, 'hospitality.diary')
  assertCan(ctx, write ? 'hospitality.manage' : 'hospitality.read')
}

export function diaryRecurrenceCron(input: Pick<DiaryTemplateInput, 'recurrence' | 'dueTime' | 'weekday' | 'monthDay'>): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)) throw new Error('Due time must use HH:MM.')
  const [hour, minute] = input.dueTime.split(':').map(Number)
  if (input.recurrence === 'daily') return `${minute} ${hour} * * *`
  if (input.recurrence === 'weekly') {
    const weekday = Number(input.weekday)
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('Weekly recurrence requires a valid weekday.')
    return `${minute} ${hour} * * ${weekday}`
  }
  const monthDay = Number(input.monthDay)
  if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 28) throw new Error('Monthly recurrence requires a day between 1 and 28.')
  return `${minute} ${hour} ${monthDay} * *`
}

function validateTimezone(timezone: string): string {
  const value = required(timezone, 'Timezone')
  try { new Intl.DateTimeFormat('en-CA', { timeZone: value }).format(new Date()) } catch { throw new Error('Timezone is invalid.') }
  return value
}

async function propertyForTenant(ctx: RequestContext, propertyId: string) {
  const [property] = await ctx.db((tx) => tx.select().from(hospitalityProperties).where(and(eq(hospitalityProperties.tenantId, ctx.tenantId), eq(hospitalityProperties.id, propertyId), isNull(hospitalityProperties.deletedAt))).limit(1))
  if (!property) throw new Error('Property does not exist in this tenant.')
  return property
}

async function assertAssignee(ctx: RequestContext, assigneeId?: string) {
  if (!assigneeId) return null
  const [member] = await ctx.db((tx) => tx.select({ id: tenantUsers.id }).from(tenantUsers).where(and(eq(tenantUsers.tenantId, ctx.tenantId), eq(tenantUsers.id, assigneeId), eq(tenantUsers.status, 'active'))).limit(1))
  if (!member) throw new Error('Assignee does not belong to this tenant.')
  return member.id
}

export function isOperationalTaskOverdue(task: { status: string; dueAt: Date }, now = new Date()): boolean {
  return !['completed', 'waived', 'cancelled'].includes(task.status) && task.dueAt < now
}

export async function listPropertyDiary(ctx: RequestContext, propertyId: string, now = new Date()) {
  await gate(ctx)
  await propertyForTenant(ctx, propertyId)
  const rows = await ctx.db((tx) => tx.select({ occurrence: operationalTaskOccurrences, schedule: operationalTaskSchedules, template: operationalTaskTemplates }).from(operationalTaskOccurrences).innerJoin(operationalTaskSchedules, and(eq(operationalTaskSchedules.tenantId, operationalTaskOccurrences.tenantId), eq(operationalTaskSchedules.id, operationalTaskOccurrences.scheduleId))).innerJoin(operationalTaskTemplates, and(eq(operationalTaskTemplates.tenantId, operationalTaskSchedules.tenantId), eq(operationalTaskTemplates.id, operationalTaskSchedules.templateId))).where(and(eq(operationalTaskOccurrences.tenantId, ctx.tenantId), eq(operationalTaskSchedules.propertyId, propertyId), isNull(operationalTaskTemplates.deletedAt))).orderBy(asc(operationalTaskOccurrences.dueAt)))
  return rows.map((row) => ({ ...row, overdue: isOperationalTaskOverdue(row.occurrence, now) }))
}

export async function getDiaryTemplate(ctx: RequestContext, propertyId: string, scheduleId: string) {
  await gate(ctx)
  const property = await propertyForTenant(ctx, propertyId)
  const [row] = await ctx.db((tx) => tx.select({ schedule: operationalTaskSchedules, template: operationalTaskTemplates }).from(operationalTaskSchedules).innerJoin(operationalTaskTemplates, and(eq(operationalTaskTemplates.tenantId, operationalTaskSchedules.tenantId), eq(operationalTaskTemplates.id, operationalTaskSchedules.templateId))).where(and(eq(operationalTaskSchedules.tenantId, ctx.tenantId), eq(operationalTaskSchedules.id, scheduleId), eq(operationalTaskSchedules.propertyId, propertyId), isNull(operationalTaskTemplates.deletedAt))).limit(1))
  if (!row) throw new Error('Task template does not belong to this property.')
  return { property, ...row }
}

export async function createDiaryTemplate(ctx: RequestContext, propertyId: string, input: DiaryTemplateInput) {
  await gate(ctx, true)
  const property = await propertyForTenant(ctx, propertyId)
  const title = required(input.title, 'Task title')
  const timezone = validateTimezone(input.timezone || property.timezone)
  const assigneeId = await assertAssignee(ctx, input.assigneeId)
  const recurrence = { kind: input.recurrence, cron: diaryRecurrenceCron(input), dueOffsetMinutes: 0 }
  const result = await ctx.db(async (tx) => {
    const [template] = await tx.insert(operationalTaskTemplates).values({ tenantId: ctx.tenantId, title, instructions: input.instructions?.trim() || null }).returning()
    if (!template) throw new Error('Task template creation failed.')
    const [schedule] = await tx.insert(operationalTaskSchedules).values({ tenantId: ctx.tenantId, templateId: template.id, propertyId, timezone, recurrence, startsAt: new Date(), assignedToTenantUserId: assigneeId }).returning()
    if (!schedule) throw new Error('Task schedule creation failed.')
    return { template, schedule }
  })
  await recordAudit(ctx, { entityType: 'operational_task_template', entityId: result.template.id, action: 'create', summary: `Created diary task template ${title}`, metadata: { propertyId, recurrence: input.recurrence } })
  return result
}

export async function updateDiaryTemplate(ctx: RequestContext, propertyId: string, scheduleId: string, input: DiaryTemplateInput) {
  await gate(ctx, true)
  const property = await propertyForTenant(ctx, propertyId)
  const title = required(input.title, 'Task title')
  const timezone = validateTimezone(input.timezone || property.timezone)
  const assigneeId = await assertAssignee(ctx, input.assigneeId)
  const recurrence = { kind: input.recurrence, cron: diaryRecurrenceCron(input), dueOffsetMinutes: 0 }
  const result = await ctx.db(async (tx) => {
    const [schedule] = await tx.select().from(operationalTaskSchedules).where(and(eq(operationalTaskSchedules.tenantId, ctx.tenantId), eq(operationalTaskSchedules.id, scheduleId), eq(operationalTaskSchedules.propertyId, propertyId))).limit(1)
    if (!schedule) throw new Error('Task schedule does not belong to this property.')
    const [template] = await tx.update(operationalTaskTemplates).set({ title, instructions: input.instructions?.trim() || null }).where(and(eq(operationalTaskTemplates.tenantId, ctx.tenantId), eq(operationalTaskTemplates.id, schedule.templateId), isNull(operationalTaskTemplates.deletedAt))).returning()
    if (!template) throw new Error('Task template is unavailable.')
    const [updated] = await tx.update(operationalTaskSchedules).set({ timezone, recurrence, assignedToTenantUserId: assigneeId }).where(and(eq(operationalTaskSchedules.tenantId, ctx.tenantId), eq(operationalTaskSchedules.id, scheduleId))).returning()
    if (!updated) throw new Error('Task schedule update failed.')
    return { template, schedule: updated }
  })
  await recordAudit(ctx, { entityType: 'operational_task_template', entityId: result.template.id, action: 'update', summary: `Updated diary task template ${title}`, metadata: { propertyId, scheduleId } })
  return result
}

export async function setDiaryTemplateActive(ctx: RequestContext, propertyId: string, scheduleId: string, isActive: boolean) {
  await gate(ctx, true); await propertyForTenant(ctx, propertyId)
  const [schedule] = await ctx.db((tx) => tx.update(operationalTaskSchedules).set({ isActive }).where(and(eq(operationalTaskSchedules.tenantId, ctx.tenantId), eq(operationalTaskSchedules.id, scheduleId), eq(operationalTaskSchedules.propertyId, propertyId))).returning())
  if (!schedule) throw new Error('Task schedule does not belong to this property.')
  await recordAudit(ctx, { entityType: 'operational_task_schedule', entityId: scheduleId, action: 'update', summary: `${isActive ? 'Enabled' : 'Disabled'} diary task schedule`, metadata: { propertyId } })
  return schedule
}

export async function completeDiaryTask(ctx: RequestContext, propertyId: string, occurrenceId: string, notes: string) {
  await gate(ctx, true); await propertyForTenant(ctx, propertyId)
  const [owned] = await ctx.db((tx) => tx.select({ id: operationalTaskOccurrences.id }).from(operationalTaskOccurrences).innerJoin(operationalTaskSchedules, and(eq(operationalTaskSchedules.tenantId, operationalTaskOccurrences.tenantId), eq(operationalTaskSchedules.id, operationalTaskOccurrences.scheduleId))).where(and(eq(operationalTaskOccurrences.tenantId, ctx.tenantId), eq(operationalTaskOccurrences.id, occurrenceId), eq(operationalTaskSchedules.propertyId, propertyId))).limit(1))
  if (!owned) throw new Error('Task does not belong to this property.')
  const [task] = await ctx.db((tx) => tx.update(operationalTaskOccurrences).set({ status: 'completed', completedAt: new Date(), completedByTenantUserId: ctx.membership?.id ?? null, completionNotes: notes.trim() || null }).where(and(eq(operationalTaskOccurrences.tenantId, ctx.tenantId), eq(operationalTaskOccurrences.id, occurrenceId), or(eq(operationalTaskOccurrences.status, 'open'), eq(operationalTaskOccurrences.status, 'in_progress'), eq(operationalTaskOccurrences.status, 'overdue')))).returning())
  if (!task) throw new Error('Task cannot be completed.')
  await recordAudit(ctx, { entityType: 'operational_task_occurrence', entityId: task.id, action: 'update', summary: 'Completed diary task', metadata: { propertyId, transition: 'completed' } })
  return task
}

export async function getOrCreateDiaryCorrectiveAction(ctx: RequestContext, propertyId: string, occurrenceId: string) {
  await gate(ctx, true); await propertyForTenant(ctx, propertyId)
  const result = await ctx.db(async (tx) => {
    const [task] = await tx.select({ occurrence: operationalTaskOccurrences, schedule: operationalTaskSchedules, template: operationalTaskTemplates }).from(operationalTaskOccurrences).innerJoin(operationalTaskSchedules, and(eq(operationalTaskSchedules.tenantId, operationalTaskOccurrences.tenantId), eq(operationalTaskSchedules.id, operationalTaskOccurrences.scheduleId))).innerJoin(operationalTaskTemplates, and(eq(operationalTaskTemplates.tenantId, operationalTaskSchedules.tenantId), eq(operationalTaskTemplates.id, operationalTaskSchedules.templateId))).where(and(eq(operationalTaskOccurrences.tenantId, ctx.tenantId), eq(operationalTaskOccurrences.id, occurrenceId), eq(operationalTaskSchedules.propertyId, propertyId))).limit(1).for('update')
    if (!task) throw new Error('Task does not belong to this property.')
    const [existing] = await tx.select().from(correctiveActions).where(and(eq(correctiveActions.tenantId, ctx.tenantId), eq(correctiveActions.sourceEntityType, 'operational_task_occurrence'), eq(correctiveActions.sourceEntityId, occurrenceId))).limit(1)
    if (existing) return { row: existing, created: false }
    const reference = await nextReference(tx, ctx.tenantId, 'corrective_action')
    const [row] = await tx.insert(correctiveActions).values({ tenantId: ctx.tenantId, reference, title: `Overdue diary task: ${task.template.title}`, description: `Created from hospitality property ${propertyId}; task due ${task.occurrence.dueAt.toISOString()}.`, severity: 'high', status: 'open', source: 'other', sourceEntityType: 'operational_task_occurrence', sourceEntityId: occurrenceId, assignedOn: new Date().toISOString().slice(0, 10), assignedByTenantUserId: ctx.membership?.id ?? null, ownerTenantUserId: ctx.membership?.id ?? null, metadata: { propertyId, occurrenceId } }).returning()
    if (!row) throw new Error('Corrective action creation failed.')
    return { row, created: true }
  })
  if (result.created) await recordAudit(ctx, { entityType: 'operational_task_occurrence', entityId: occurrenceId, action: 'update', summary: `Created corrective action ${result.row.reference}`, metadata: { correctiveActionId: result.row.id, propertyId } })
  return result
}

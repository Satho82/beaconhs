'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import {
  hospitalityProperties,
  inspectionTypes,
  operationalTaskSchedules,
  operationalTaskTemplates,
  tenantUsers,
} from '@beaconhs/db/schema'
import { assertCan } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { recordAuditInTransaction } from '@/lib/audit'
import { assertCanManageModule } from '@/lib/module-admin/guard'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCanAccessProperty } from '@/lib/hospitality/property-access'
import { diaryRecurrenceCron, type DiaryRecurrence } from '@/lib/hospitality/diary-rules'

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const optional = (form: FormData, key: string) => value(form, key) || undefined

function recurrence(form: FormData): DiaryRecurrence {
  const candidate = value(form, 'recurrence')
  if (!['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(candidate)) {
    throw new Error('Choose a valid inspection frequency.')
  }
  return candidate as DiaryRecurrence
}

export async function createInspectionSchedule(form: FormData) {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'inspections.create')
  assertCanManageModule(ctx, 'inspections')
  await assertTenantModuleEntitled(ctx, 'hospitality.diary')
  const propertyId = value(form, 'propertyId')
  const typeId = value(form, 'typeId')
  const cadence = recurrence(form)
  await assertCanAccessProperty(ctx, propertyId)

  await ctx.db(async (tx) => {
    const [property] = await tx
      .select({ id: hospitalityProperties.id, timezone: hospitalityProperties.timezone })
      .from(hospitalityProperties)
      .where(
        and(
          eq(hospitalityProperties.tenantId, ctx.tenantId),
          eq(hospitalityProperties.id, propertyId),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .limit(1)
    if (!property) throw new Error('Property not found.')
    const [type] = await tx
      .select({ id: inspectionTypes.id, name: inspectionTypes.name })
      .from(inspectionTypes)
      .where(
        and(
          eq(inspectionTypes.tenantId, ctx.tenantId),
          eq(inspectionTypes.id, typeId),
          eq(inspectionTypes.isPublished, true),
          isNull(inspectionTypes.deletedAt),
        ),
      )
      .limit(1)
    if (!type) throw new Error('Choose a published inspection type.')
    const assigneeId = optional(form, 'assigneeId')
    if (assigneeId) {
      const [member] = await tx
        .select({ id: tenantUsers.id })
        .from(tenantUsers)
        .where(
          and(
            eq(tenantUsers.tenantId, ctx.tenantId),
            eq(tenantUsers.id, assigneeId),
            eq(tenantUsers.status, 'active'),
          ),
        )
        .limit(1)
      if (!member) throw new Error('Assignee does not belong to this tenant.')
    }
    const cron = diaryRecurrenceCron({
      recurrence: cadence,
      dueTime: value(form, 'dueTime') || '09:00',
      weekday: optional(form, 'weekday'),
      monthDay: optional(form, 'monthDay'),
      annualMonth: optional(form, 'annualMonth'),
    })
    const [template] = await tx
      .insert(operationalTaskTemplates)
      .values({
        tenantId: ctx.tenantId,
        title: `Inspection · ${type.name}`,
        instructions: 'Complete the scheduled inspection and record the required sign-off.',
        requiresEvidence: false,
      })
      .returning({ id: operationalTaskTemplates.id })
    if (!template) throw new Error('Could not create the inspection template.')
    const [schedule] = await tx
      .insert(operationalTaskSchedules)
      .values({
        tenantId: ctx.tenantId,
        templateId: template.id,
        propertyId,
        inspectionTypeId: type.id,
        timezone: property.timezone,
        recurrence: { kind: cadence, cron, dueOffsetMinutes: 0 },
        startsAt: new Date(),
        assignedToTenantUserId: assigneeId ?? null,
      })
      .returning({ id: operationalTaskSchedules.id })
    if (!schedule) throw new Error('Could not create the inspection schedule.')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'inspection_schedule',
      entityId: schedule.id,
      action: 'create',
      summary: `Scheduled ${type.name} (${cadence})`,
      after: {
        inspectionTypeId: type.id,
        propertyId,
        cadence,
        cron,
        assigneeId: assigneeId ?? null,
      },
    })
  })
  revalidatePath('/inspections/calendar')
}

export async function setInspectionScheduleActive(form: FormData) {
  const ctx = await requireRequestContext()
  assertCanManageModule(ctx, 'inspections')
  const scheduleId = value(form, 'scheduleId')
  const isActive = value(form, 'isActive') === 'true'
  await ctx.db(async (tx) => {
    const [schedule] = await tx
      .update(operationalTaskSchedules)
      .set({ isActive })
      .where(
        and(
          eq(operationalTaskSchedules.tenantId, ctx.tenantId),
          eq(operationalTaskSchedules.id, scheduleId),
        ),
      )
      .returning({
        id: operationalTaskSchedules.id,
        inspectionTypeId: operationalTaskSchedules.inspectionTypeId,
      })
    if (!schedule?.inspectionTypeId) throw new Error('Inspection schedule not found.')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'inspection_schedule',
      entityId: schedule.id,
      action: isActive ? 'update' : 'archive',
      summary: isActive ? 'Reactivated inspection schedule' : 'Paused inspection schedule',
    })
  })
  revalidatePath('/inspections/calendar')
}

'use server'

import { revalidatePath } from 'next/cache'
import { requireRequestContext } from '@/lib/auth'
import { completeDiaryTask, createDiaryTemplate, getOrCreateDiaryCorrectiveAction, setDiaryTemplateActive, updateDiaryTemplate } from '@/lib/hospitality/diary'
import { redirect } from 'next/navigation'

const value = (form: FormData, key: string) => String(form.get(key) ?? '')
const optional = (form: FormData, key: string) => value(form, key).trim() || undefined
const path = (propertyId: string) => `/hospitality/properties/${propertyId}/diary`

function input(form: FormData) {
  const recurrence = value(form, 'recurrence')
  if (recurrence !== 'daily' && recurrence !== 'weekly' && recurrence !== 'monthly') throw new Error('Invalid diary recurrence.')
  return { title: value(form, 'title'), instructions: optional(form, 'instructions'), recurrence, dueTime: value(form, 'dueTime'), weekday: optional(form, 'weekday'), monthDay: optional(form, 'monthDay'), timezone: value(form, 'timezone'), assigneeId: optional(form, 'assigneeId') }
}

export async function createDiaryTemplateAction(form: FormData) {
  const ctx = await requireRequestContext(); const propertyId = value(form, 'propertyId')
  await createDiaryTemplate(ctx, propertyId, input(form)); revalidatePath(path(propertyId))
}

export async function updateDiaryTemplateAction(form: FormData) {
  const ctx = await requireRequestContext(); const propertyId = value(form, 'propertyId')
  await updateDiaryTemplate(ctx, propertyId, value(form, 'scheduleId'), input(form)); revalidatePath(path(propertyId))
}

export async function setDiaryTemplateActiveAction(form: FormData) {
  const ctx = await requireRequestContext(); const propertyId = value(form, 'propertyId')
  await setDiaryTemplateActive(ctx, propertyId, value(form, 'scheduleId'), value(form, 'isActive') === 'true'); revalidatePath(path(propertyId))
}

export async function completeDiaryTaskAction(form: FormData) {
  const ctx = await requireRequestContext(); const propertyId = value(form, 'propertyId')
  await completeDiaryTask(ctx, propertyId, value(form, 'occurrenceId'), value(form, 'completionNotes')); revalidatePath(path(propertyId))
}

export async function createDiaryCorrectiveActionAction(form: FormData) {
  const ctx = await requireRequestContext(); const propertyId = value(form, 'propertyId')
  const result = await getOrCreateDiaryCorrectiveAction(ctx, propertyId, value(form, 'occurrenceId'))
  redirect(`/corrective-actions/${result.row.id}`)
}

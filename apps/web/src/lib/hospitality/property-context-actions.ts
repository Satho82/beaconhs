'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isUuid } from '@/lib/list-params'
import { getRequestContext } from '@/lib/auth'
import {
  ACTIVE_HOSPITALITY_PROPERTY_COOKIE,
  ALL_PROPERTIES_CONTEXT,
  resolveHospitalityPropertyContext,
} from './property-context'

export async function setActiveHospitalityProperty(
  propertyId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getRequestContext()
  if (!ctx) return { ok: false, error: 'Not signed in' }
  if (propertyId !== null && !isUuid(propertyId)) return { ok: false, error: 'Invalid property' }

  const context = await resolveHospitalityPropertyContext(ctx)
  if (propertyId !== null && !context.properties.some((property) => property.id === propertyId)) {
    return { ok: false, error: 'That property is not available to you' }
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_HOSPITALITY_PROPERTY_COOKIE, propertyId ?? ALL_PROPERTIES_CONTEXT, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}

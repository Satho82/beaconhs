'use server'

import { headers } from 'next/headers'
import {
  parseGuestMaintenanceInput,
  submitGuestMaintenanceIssue,
} from '@/lib/hospitality/guest-maintenance'

export type GuestReportState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  reference?: string
}

const value = (form: FormData, key: string) => String(form.get(key) ?? '')

export async function submitGuestReport(
  _previous: GuestReportState,
  form: FormData,
): Promise<GuestReportState> {
  try {
    const input = parseGuestMaintenanceInput({
      token: value(form, 'token'),
      submissionId: value(form, 'submissionId'),
      category: value(form, 'category'),
      description: value(form, 'description'),
      priority: value(form, 'priority'),
      guestName: value(form, 'guestName'),
      guestContact: value(form, 'guestContact'),
      contactConsent: form.get('contactConsent') === 'on',
      website: value(form, 'website'),
    })
    const h = await headers()
    const fingerprint =
      h.get('cf-connecting-ip') ||
      h.get('x-real-ip') ||
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown'
    const candidate = form.get('photo')
    const photo = candidate instanceof File && candidate.size > 0 ? candidate : null
    const result = await submitGuestMaintenanceIssue(input, fingerprint, photo)
    return {
      status: 'success',
      message: 'Thank you. The hotel team has received your report.',
      reference: result.reference === 'received' ? undefined : result.reference,
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'The report could not be sent.',
    }
  }
}

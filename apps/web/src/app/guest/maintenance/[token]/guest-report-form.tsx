'use client'

import { useActionState } from 'react'
import { useGeneratedValueTranslations } from '@/i18n/generated'
import { Button, Input, Label, Select } from '@beaconhs/ui'
import { submitGuestReport, type GuestReportState } from './actions'

const initialState: GuestReportState = { status: 'idle' }

export function GuestReportForm({ token, submissionId }: { token: string; submissionId: string }) {
  const translateValue = useGeneratedValueTranslations()
  const [state, action, pending] = useActionState(submitGuestReport, initialState)
  if (state.status === 'success') {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
        <h2 className="text-xl font-semibold">{translateValue('Report received')}</h2>
        <p className="mt-2">{state.message}</p>
        {state.reference && (
          <p className="mt-3 text-sm">
            {translateValue('Reference:')} {state.reference}
          </p>
        )}
      </section>
    )
  }
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="submissionId" value={submissionId} />
      <div className="absolute -left-[10000px]" aria-hidden="true">
        <Label>
          Website
          <Input name="website" tabIndex={-1} autoComplete="off" />
        </Label>
      </div>
      <Label>
        {translateValue('What needs attention?')}
        <Select name="category" required defaultValue="">
          <option value="" disabled>
            {translateValue('Choose an issue')}
          </option>
          <option>{translateValue('Heating or cooling')}</option>
          <option>{translateValue('Water or bathroom')}</option>
          <option>{translateValue('Lighting or electricity')}</option>
          <option>{translateValue('Door, lock or access')}</option>
          <option>{translateValue('Furniture or fittings')}</option>
          <option>{translateValue('Cleaning or housekeeping')}</option>
          <option>{translateValue('Other maintenance issue')}</option>
        </Select>
      </Label>
      <Label>
        {translateValue('Tell us what happened')}
        <textarea
          name="description"
          required
          minLength={5}
          maxLength={2000}
          rows={5}
          className="bg-background mt-1 w-full rounded-md border px-3 py-2 text-base"
          placeholder={translateValue(
            'Include where the problem is and anything that may help us respond.',
          )}
        />
      </Label>
      <Label>
        {translateValue('Photo (optional)')}
        <Input
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        />
        <span className="text-muted-foreground mt-1 block text-xs">
          {translateValue('Add one photo to help the hotel team. Maximum 10 MB.')}
        </span>
      </Label>
      <Label>
        {translateValue('Urgency')}
        <Select name="priority" defaultValue="medium">
          <option value="low">{translateValue('Low — can wait')}</option>
          <option value="medium">{translateValue('Normal')}</option>
          <option value="high">{translateValue('Urgent — affecting the stay')}</option>
        </Select>
      </Label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label>
          {translateValue('Name (optional)')}
          <Input name="guestName" maxLength={120} autoComplete="name" />
        </Label>
        <Label>
          {translateValue('Contact details (optional)')}
          <Input name="guestContact" maxLength={240} autoComplete="email" />
        </Label>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="contactConsent" className="mt-1 size-4" />
        <span>
          {translateValue(
            'I agree that the hotel may use these contact details to follow up on this report.',
          )}
        </span>
      </label>
      {state.status === 'error' && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="min-h-12 w-full text-base">
        {pending ? translateValue('Sending…') : translateValue('Send report')}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        {translateValue('For immediate danger or flooding, contact reception now.')}
      </p>
    </form>
  )
}

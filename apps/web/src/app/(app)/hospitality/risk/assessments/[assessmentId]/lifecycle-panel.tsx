'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button, Select } from '@beaconhs/ui'
import { useGeneratedValueTranslations } from '@/i18n/generated'
import { applyRiskLifecycleActionRequest } from '../../actions'

type Action = 'adopted' | 'reviewed' | 're_adopted' | 'amended' | 'retired'
export function RiskLifecyclePanel({
  assessmentId,
  status,
  effectiveDate,
  nextReviewDate,
  reminderLeadDays,
}: {
  assessmentId: string
  status: string
  effectiveDate: string | null
  nextReviewDate: string | null
  reminderLeadDays: number
}) {
  const translateValue = useGeneratedValueTranslations()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [action, setAction] = useState<Action>(effectiveDate ? 'reviewed' : 'adopted')
  const [effective, setEffective] = useState(effectiveDate ?? today)
  const [validity, setValidity] = useState('12')
  const [customReview, setCustomReview] = useState(nextReviewDate ?? '')
  const [lead, setLead] = useState(String(reminderLeadDays))
  const [comments, setComments] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    setMessage('')
    startTransition(async () => {
      try {
        await applyRiskLifecycleActionRequest(assessmentId, {
          action,
          effectiveDate: effective,
          validityMonths: validity === 'custom' ? null : Number(validity),
          customReviewDate: validity === 'custom' ? customReview : null,
          reminderLeadDays: Number(lead),
          comments,
        })
        setMessage(translateValue('Risk lifecycle sign-off recorded.'))
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : translateValue('Could not record sign-off.'),
        )
      }
    })
  }

  return (
    <section className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="font-semibold">{translateValue('Review and sign-off')}</h2>
        <p className="text-muted-foreground text-sm">
          {translateValue('Current lifecycle status')}: {status.replaceAll('_', ' ')}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium">
          {translateValue('Sign-off action')}
          <Select
            value={action}
            onChange={(event) => setAction(event.target.value as Action)}
            className="mt-1 w-full"
          >
            <option value="adopted">{translateValue('Adopted')}</option>
            <option value="reviewed">{translateValue('Reviewed')}</option>
            <option value="re_adopted">{translateValue('Re-adopted unchanged')}</option>
            <option value="amended">{translateValue('Reviewed and amended')}</option>
            <option value="retired">{translateValue('Retired')}</option>
          </Select>
        </label>
        <label className="text-sm font-medium">
          {translateValue('Effective date')}
          <input
            type="date"
            value={effective}
            onChange={(event) => setEffective(event.target.value)}
            className="bg-background mt-1 w-full rounded-md border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          {translateValue('Validity')}
          <Select
            value={validity}
            onChange={(event) => setValidity(event.target.value)}
            className="mt-1 w-full"
          >
            {[3, 6, 12, 24].map((months) => (
              <option key={months} value={months}>
                {months} {translateValue('months')}
              </option>
            ))}
            <option value="custom">{translateValue('Custom')}</option>
          </Select>
        </label>
        {validity === 'custom' && (
          <label className="text-sm font-medium">
            {translateValue('Next review date')}
            <input
              type="date"
              value={customReview}
              onChange={(event) => setCustomReview(event.target.value)}
              className="bg-background mt-1 w-full rounded-md border px-3 py-2"
            />
          </label>
        )}
        <label className="text-sm font-medium">
          {translateValue('Reminder lead time')}
          <Select
            value={lead}
            onChange={(event) => setLead(event.target.value)}
            className="mt-1 w-full"
          >
            {[90, 60, 30, 14, 7].map((days) => (
              <option key={days} value={days}>
                {days} {translateValue('days')}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm font-medium md:col-span-2">
          {translateValue('Sign-off comments')}
          <textarea
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            className="bg-background mt-1 min-h-20 w-full rounded-md border px-3 py-2"
          />
        </label>
      </div>
      <Button onClick={submit} disabled={pending}>
        {pending ? translateValue('Recording…') : translateValue('Record immutable sign-off')}
      </Button>
      {message && <p className="text-sm">{message}</p>}
    </section>
  )
}

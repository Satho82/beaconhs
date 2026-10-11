'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Drawer, Input, Select } from '@beaconhs/ui'
import { CalendarClock } from 'lucide-react'
import { useGeneratedValueTranslations } from '@/i18n/generated'

export function ScheduleReviewPicker({
  assessments,
}: {
  assessments: { id: string; reference: string; title: string }[]
}) {
  const translateValue = useGeneratedValueTranslations()
  const router = useRouter(),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState('')
  const matches = assessments.filter((row) =>
    `${row.reference} ${row.title}`.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarClock className="mr-2 h-4 w-4" /> {translateValue('Schedule Review')}
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title={translateValue('Schedule Review')}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (assessments.some((row) => row.id === selected))
              router.push(`/hospitality/risk/assessments/${selected}#review-signoff`)
          }}
        >
          <p>
            {translateValue(
              'Select an assessment, then set its review period and record the sign-off on the assessment page.',
            )}
          </p>
          <Input
            aria-label={translateValue('Find an assessment')}
            placeholder={translateValue('Search by reference or title')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected('')
            }}
          />
          <label className="grid gap-1">
            {translateValue('Assessment')}{' '}
            <Select required value={selected} onChange={(event) => setSelected(event.target.value)}>
              <option value="">Select an assessment</option>
              {matches.slice(0, 50).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.reference} · {row.title}
                </option>
              ))}
            </Select>
          </label>
          {matches.length > 50 && (
            <p>
              {translateValue(
                'Refine the search to find an assessment. Showing the first 50 matches.',
              )}
            </p>
          )}
          {!matches.length && <p>{translateValue('No matching assessments.')}</p>}
          <Button type="submit" disabled={!selected}>
            {translateValue('Continue to review and sign-off')}
          </Button>
        </form>
      </Drawer>
    </>
  )
}

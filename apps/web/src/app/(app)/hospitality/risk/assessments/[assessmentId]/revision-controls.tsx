'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input } from '@beaconhs/ui'
import type { RiskMatrixSnapshot } from '@beaconhs/db/schema'
import { archiveRiskHazardAction, selectRiskMatrixAction } from '../../actions'
import { useGeneratedTranslations, useGeneratedValueTranslations } from '@/i18n/generated'

export function RevisionControls({
  assessmentId,
  revision,
  matrix,
  unknownMatrix,
  hazards,
}: {
  assessmentId: string
  revision: number
  matrix: RiskMatrixSnapshot
  unknownMatrix: boolean
  hazards: { id: string; hazardDescription: string; archivedAt: Date | null }[]
}) {
  const translateValue = useGeneratedValueTranslations()
  const translateMessage = useGeneratedTranslations()
  const router = useRouter(),
    [pending, start] = useTransition()
  const [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1)
  const filtered = hazards.filter((h) =>
    h.hazardDescription.toLowerCase().includes(query.toLowerCase()),
  )
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 10)))
  function perform(operation: () => Promise<unknown>) {
    setError('')
    start(async () => {
      try {
        await operation()
        setReason('')
        router.refresh()
      } catch {
        setError(
          'The change could not be saved. Reload if another person has changed this assessment.',
        )
      }
    })
  }
  return (
    <section className="space-y-3 rounded-lg border p-5">
      <h2 className="font-semibold">
        {translateValue('Content revision')} {revision}
      </h2>
      {unknownMatrix && (
        <p role="status">
          {translateValue(
            'Historical matrix unknown. Select a matrix before editing or signing. Earlier revisions will remain unchanged.',
          )}
        </p>
      )}
      <label className="grid gap-1 text-sm">
        {translateValue('Reason for change')}{' '}
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={2000}
        />
      </label>
      <Button
        variant="outline"
        disabled={pending || !reason.trim()}
        onClick={() =>
          perform(() =>
            selectRiskMatrixAction(assessmentId, { matrix, reason, expectedRevision: revision }),
          )
        }
      >
        {translateMessage('m_199ad489618701', { value0: matrix.size })}
      </Button>
      <p className="text-muted-foreground text-sm">
        {translateValue(
          'Changing the matrix or archiving a hazard returns the assessment to draft for a new sign-off. Linked actions are retained.',
        )}
      </p>
      <Input
        aria-label={translateValue('Search hazards')}
        placeholder={translateValue('Search hazards')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setPage(1)
        }}
      />
      <ul className="divide-y">
        {filtered.slice((currentPage - 1) * 10, currentPage * 10).map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-3 py-2">
            <span>
              {h.hazardDescription}
              {h.archivedAt ? translateValue('· Archived') : ''}
            </span>
            <Button
              variant="outline"
              disabled={pending || unknownMatrix || !reason.trim()}
              onClick={() =>
                perform(() =>
                  archiveRiskHazardAction(assessmentId, h.id, {
                    archived: !h.archivedAt,
                    reason,
                    expectedRevision: revision,
                  }),
                )
              }
            >
              {h.archivedAt ? translateValue('Restore') : translateValue('Archive')}
            </Button>
          </li>
        ))}
      </ul>
      {filtered.length > 10 && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            {translateValue('Previous')}
          </Button>
          <span>
            {translateValue('Page')} {currentPage} {translateValue('of')}{' '}
            {Math.ceil(filtered.length / 10)}
          </span>
          <Button
            variant="outline"
            disabled={currentPage * 10 >= filtered.length}
            onClick={() => setPage(currentPage + 1)}
          >
            {translateValue('Next')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

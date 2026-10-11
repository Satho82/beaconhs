'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Drawer, Input, Select } from '@beaconhs/ui'
import { RISK_LIBRARY_CATEGORIES } from '@beaconhs/db/risk-library'
import type { RiskMatrixSnapshot } from '@beaconhs/db/schema'
import { createManualRiskAssessmentAction } from './actions'
import { useGeneratedTranslations, useGeneratedValueTranslations } from '@/i18n/generated'

export function CreateManualAssessment({
  properties,
  propertyId,
  matrix,
}: {
  properties: { id: string; name: string }[]
  propertyId: string | null
  matrix: RiskMatrixSnapshot
}) {
  const translateValue = useGeneratedValueTranslations()
  const translateMessage = useGeneratedTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(''),
    [property, setProperty] = useState(propertyId ?? '')
  const [category, setCategory] = useState<(typeof RISK_LIBRARY_CATEGORIES)[number]>('general')
  const [pending, start] = useTransition(),
    [error, setError] = useState('')
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {translateValue('Create from scratch')}
      </Button>
      <Drawer
        open={open}
        onClose={() => {
          if (!pending) setOpen(false)
        }}
        title={translateValue('Create from scratch')}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setError('')
            start(async () => {
              try {
                const result = await createManualRiskAssessmentAction({
                  title,
                  propertyId: property,
                  category,
                  matrix,
                })
                router.push(`/hospitality/risk/assessments/${result.assessmentId}`)
              } catch {
                setError(
                  'Could not create the draft. Check the property and title, then try again.',
                )
              }
            })
          }}
        >
          <fieldset disabled={pending} className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {translateValue(
                'Create a property assessment with no source template. Add hazards and controls before signing off.',
              )}
            </p>
            <label className="grid gap-1">
              {translateValue('Property')}{' '}
              <Select
                required
                value={property}
                onChange={(event) => setProperty(event.target.value)}
              >
                <option value="">Select a property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1">
              {translateValue('Title')}{' '}
              <Input
                required
                maxLength={300}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="grid gap-1">
              {translateValue('Category')}{' '}
              <Select
                value={category}
                onChange={(event) => setCategory(event.target.value as typeof category)}
              >
                {RISK_LIBRARY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>
            </label>
            <p className="text-sm">
              {translateMessage('m_1e35b4920e35f6', { value0: matrix.size })}
            </p>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <Button type="submit">{translateValue('Create draft')}</Button>
          </fieldset>
        </form>
      </Drawer>
    </>
  )
}

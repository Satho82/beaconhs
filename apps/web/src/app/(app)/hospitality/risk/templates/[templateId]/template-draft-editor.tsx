'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Textarea, Select } from '@beaconhs/ui'
import { RISK_LIBRARY_CATEGORIES } from '@beaconhs/db/risk-library'
import type { riskTemplates } from '@beaconhs/db/schema'
import { useGeneratedValueTranslations } from '@/i18n/generated'
import {
  nextRiskTemplateDraftAction,
  publishRiskTemplateAction,
  saveRiskTemplateDraftAction,
} from '../../actions'

export function TemplateDraftEditor({ template }: { template: typeof riskTemplates.$inferSelect }) {
  const translateValue = useGeneratedValueTranslations()
  const router = useRouter(),
    [pending, start] = useTransition(),
    [error, setError] = useState('')
  const [title, setTitle] = useState(template.title),
    [description, setDescription] = useState(template.description)
  const [category, setCategory] = useState(template.category),
    [hazards, setHazards] = useState(template.hazards)
  const [updatedAt, setUpdatedAt] = useState(template.updatedAt.toISOString()),
    [dirty, setDirty] = useState(false)
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(1)
  const filtered = hazards
    .map((h, index) => ({ h, index }))
    .filter(({ h }) => h.hazard.toLowerCase().includes(query.toLowerCase()))
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 10)))
  function perform(operation: () => Promise<unknown>) {
    setError('')
    start(async () => {
      try {
        await operation()
        router.refresh()
      } catch {
        setError('The template could not be saved. Check its content and reload if it has changed.')
      }
    })
  }
  return (
    <section className="mt-5 space-y-4 rounded-lg border p-5">
      <h2 className="font-semibold">
        {translateValue('Custom template ·')} {template.state}
      </h2>
      {template.state !== 'draft' ? (
        <Button
          disabled={pending}
          onClick={() =>
            perform(async () => {
              const draft = await nextRiskTemplateDraftAction(template.id)
              router.push(`/hospitality/risk/templates/${draft.templateId}`)
            })
          }
        >
          {translateValue('Create next draft version')}
        </Button>
      ) : (
        <fieldset disabled={pending} className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {translateValue(
              'Save and review the draft before publishing. Publishing retires the previous active version. Existing assessments keep their original content.',
            )}
          </p>
          <label className="grid gap-1">
            {translateValue('Title')}{' '}
            <Input
              value={title}
              maxLength={300}
              onChange={(e) => {
                setTitle(e.target.value)
                setDirty(true)
              }}
            />
          </label>
          <label className="grid gap-1">
            {translateValue('Description')}{' '}
            <Textarea
              value={description}
              maxLength={5000}
              onChange={(e) => {
                setDescription(e.target.value)
                setDirty(true)
              }}
            />
          </label>
          <label className="grid gap-1">
            {translateValue('Category')}{' '}
            <Select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as typeof category)
                setDirty(true)
              }}
            >
              {RISK_LIBRARY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          </label>
          <Input
            aria-label={translateValue('Search template hazards')}
            placeholder={translateValue('Search hazards')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
          {filtered.slice((currentPage - 1) * 10, currentPage * 10).map(({ h, index }) => {
            function change(patch: Partial<typeof h>) {
              setHazards((values) =>
                values.map((value, i) => (i === index ? { ...value, ...patch } : value)),
              )
              setDirty(true)
            }
            return (
              <section key={index} className="space-y-2 rounded border p-3">
                <label className="grid gap-1">
                  {translateValue('Hazard')}{' '}
                  <Input value={h.hazard} onChange={(e) => change({ hazard: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  {translateValue('How harm may occur')}{' '}
                  <Textarea value={h.harm} onChange={(e) => change({ harm: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  {translateValue('People at risk (one per line)')}{' '}
                  <Textarea
                    value={h.peopleAtRisk.join('\n')}
                    onChange={(e) => change({ peopleAtRisk: e.target.value.split('\n') })}
                  />
                </label>
                <label className="grid gap-1">
                  {translateValue('Controls (one per line)')}{' '}
                  <Textarea
                    value={h.standardControls.join('\n')}
                    onChange={(e) => change({ standardControls: e.target.value.split('\n') })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      'initialLikelihood',
                      'initialSeverity',
                      'residualLikelihood',
                      'residualSeverity',
                    ] as const
                  ).map((key) => (
                    <label key={key} className="grid gap-1 text-sm">
                      {key.replace(/([A-Z])/g, ' $1')}
                      <Input
                        type="number"
                        min={1}
                        max={template.matrixSnapshot.size}
                        value={h[key] ?? (key.startsWith('initial') ? 3 : 2)}
                        onChange={(e) => change({ [key]: Number(e.target.value) })}
                      />
                    </label>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setHazards((values) => values.filter((_, i) => i !== index))
                    setDirty(true)
                  }}
                >
                  {translateValue('Remove from draft')}
                </Button>
              </section>
            )
          })}
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
                {translateValue('Page')} {currentPage}
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setHazards((values) => [
                  ...values,
                  {
                    hazard: '',
                    harm: '',
                    peopleAtRisk: [],
                    standardControls: [],
                    initialLikelihood: 3,
                    initialSeverity: 3,
                    residualLikelihood: 2,
                    residualSeverity: 2,
                  },
                ])
                setDirty(true)
                setQuery('')
                setPage(Math.ceil((hazards.length + 1) / 10))
              }}
            >
              {translateValue('Add hazard')}
            </Button>
            <Button
              onClick={() =>
                perform(async () => {
                  const result = await saveRiskTemplateDraftAction(template.id, {
                    title,
                    description,
                    category,
                    hazards: hazards.map((h) => ({
                      ...h,
                      initialLikelihood: h.initialLikelihood ?? 3,
                      initialSeverity: h.initialSeverity ?? 3,
                      residualLikelihood: h.residualLikelihood ?? 2,
                      residualSeverity: h.residualSeverity ?? 2,
                    })),
                    matrix: template.matrixSnapshot,
                    expectedUpdatedAt: updatedAt,
                  })
                  setUpdatedAt(result.updatedAt)
                  setDirty(false)
                })
              }
            >
              {translateValue('Save draft')}
            </Button>
            <Button
              variant="outline"
              disabled={dirty}
              onClick={() => perform(() => publishRiskTemplateAction(template.id, updatedAt))}
            >
              {translateValue('Publish version')}
            </Button>
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

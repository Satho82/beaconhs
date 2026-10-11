'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Select } from '@beaconhs/ui'
import {
  RiskMatrixGrid,
  RiskMatrixProvider,
  RiskScoreBadge,
  type RiskMatrixConfig,
} from '@/components/risk-matrix'
import { useGeneratedValueTranslations } from '@/i18n/generated'
import { toast } from '@/lib/toast'
import { riskActionPriority } from '@/lib/risk-assessment-matrix'
import { createRiskCorrectiveActionAction, saveRiskAssessmentAction } from '../../actions'
import type { RiskHazardInput } from '@/lib/risk-assessments'
import { PeopleAtRiskField } from './people-at-risk-field'

type HazardEditor = RiskHazardInput

const blankHazard = (): HazardEditor => ({
  hazardDescription: '',
  harmDescription: '',
  peopleAtRisk: [],
  initialLikelihood: 3,
  initialSeverity: 3,
  controls: '',
  additionalControls: '',
  residualLikelihood: 2,
  residualSeverity: 3,
})

export function AssessmentEditor({
  assessment,
  hazards: initialHazards,
  people,
  matrix,
  canEdit = true,
}: {
  assessment: {
    id: string
    title: string
    areaLocation: string | null
    activityEquipment: string | null
    assessorTenantUserId: string
    responsibleTenantUserId: string | null
    assessmentDate: string
    comments: string | null
    contentRevision: number
  }
  hazards: Array<{
    id: string
    hazardDescription: string
    harmDescription: string
    peopleAtRisk: string[]
    initialLikelihood: number
    initialSeverity: number
    controls: string
    additionalControls: string | null
    residualLikelihood: number
    residualSeverity: number
  }>
  people: { id: string; name: string }[]
  matrix: RiskMatrixConfig
  canEdit?: boolean
}) {
  const router = useRouter()
  const translateValue = useGeneratedValueTranslations()
  const [pending, start] = useTransition()
  const [revision, setRevision] = useState(assessment.contentRevision)
  const [title, setTitle] = useState(assessment.title)
  const [areaLocation, setAreaLocation] = useState(assessment.areaLocation ?? '')
  const [activityEquipment, setActivityEquipment] = useState(assessment.activityEquipment ?? '')
  const [assessorId, setAssessorId] = useState(assessment.assessorTenantUserId)
  const [responsibleId, setResponsibleId] = useState(assessment.responsibleTenantUserId ?? '')
  const [assessmentDate, setAssessmentDate] = useState(assessment.assessmentDate)
  const [comments, setComments] = useState(assessment.comments ?? '')
  const [hazards, setHazards] = useState<HazardEditor[]>(
    initialHazards.map((hazard) => ({ ...hazard, peopleAtRisk: [...hazard.peopleAtRisk] })),
  )

  function changeHazard(index: number, patch: Partial<HazardEditor>) {
    setHazards((current) =>
      current.map((hazard, itemIndex) => (itemIndex === index ? { ...hazard, ...patch } : hazard)),
    )
  }

  function save() {
    start(async () => {
      try {
        const result = await saveRiskAssessmentAction(assessment.id, {
          expectedRevision: revision,
          title,
          areaLocation,
          activityEquipment,
          assessorTenantUserId: assessorId,
          responsibleTenantUserId: responsibleId || null,
          assessmentDate,
          comments,
          hazards,
        })
        setHazards(
          result.hazards.map((hazard) => ({ ...hazard, peopleAtRisk: [...hazard.peopleAtRisk] })),
        )
        setRevision(result.contentRevision)
        router.refresh()
        toast.success(translateValue('Risk assessment saved.'))
        router.refresh()
      } catch {
        toast.error(translateValue('The risk assessment could not be saved.'))
      }
    })
  }

  function createAction(hazard: HazardEditor) {
    const ownerTenantUserId = responsibleId || assessorId
    if (!hazard.id || !ownerTenantUserId) {
      toast.error(translateValue('Save the assessment and choose an owner first.'))
      return
    }
    const dueOn = new Date(`${assessment.assessmentDate}T12:00:00Z`)
    dueOn.setUTCDate(dueOn.getUTCDate() + 14)
    const dueDate = dueOn.toISOString().slice(0, 10)
    start(async () => {
      try {
        const result = await createRiskCorrectiveActionAction(assessment.id, {
          hazardId: hazard.id!,
          title: hazard.additionalControls || hazard.hazardDescription,
          description: hazard.additionalControls,
          ownerTenantUserId,
          priority: riskActionPriority(hazard.residualLikelihood, hazard.residualSeverity, matrix),
          dueOn: dueDate,
          verificationRequired: true,
        })
        toast.success(translateValue('Corrective action created.'))
        router.push(`/corrective-actions/${result.correctiveActionId}`)
      } catch {
        toast.error(translateValue('The corrective action could not be created.'))
      }
    })
  }

  const numberField = (
    label: string,
    value: number,
    maximum: number,
    onChange: (value: number) => void,
  ) => (
    <label className="text-sm font-medium">
      {translateValue(label)}
      <Select
        className="bg-background mt-1 w-full rounded-md border px-3 py-2"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {Array.from({ length: Math.max(maximum, value) }, (_, index) => index + 1).map((item) => (
          <option key={item}>{item}</option>
        ))}
      </Select>
    </label>
  )

  return (
    <RiskMatrixProvider matrix={matrix}>
      <fieldset
        id="assessment-editor"
        disabled={pending || !canEdit}
        className="min-w-0 scroll-mt-6 space-y-6"
      >
        <section className="grid gap-4 rounded-lg border p-5 md:grid-cols-2">
          <label className="text-sm font-medium md:col-span-2">
            {translateValue('Assessment title')}
            <input
              className="bg-background mt-1 w-full rounded-md border px-3 py-2"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            {translateValue('Area / location')}
            <input
              className="bg-background mt-1 w-full rounded-md border px-3 py-2"
              value={areaLocation}
              onChange={(event) => setAreaLocation(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            {translateValue('Activity / equipment')}
            <input
              className="bg-background mt-1 w-full rounded-md border px-3 py-2"
              value={activityEquipment}
              onChange={(event) => setActivityEquipment(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            {translateValue('Assessor')}
            <Select
              className="bg-background mt-1 w-full rounded-md border px-3 py-2"
              value={assessorId}
              onChange={(event) => setAssessorId(event.target.value)}
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium">
            {translateValue('Responsible person')}
            <Select
              className="bg-background mt-1 w-full rounded-md border px-3 py-2"
              value={responsibleId}
              onChange={(event) => setResponsibleId(event.target.value)}
            >
              <option value="">{translateValue('Not assigned')}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium">
            {translateValue('Assessment date')}
            <input
              type="date"
              className="bg-background mt-1 w-full rounded-md border px-3 py-2"
              value={assessmentDate}
              onChange={(event) => setAssessmentDate(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            {translateValue('Comments')}
            <textarea
              className="bg-background mt-1 min-h-24 w-full rounded-md border px-3 py-2"
              value={comments}
              onChange={(event) => setComments(event.target.value)}
            />
          </label>
        </section>

        <section className="rounded-lg border p-5">
          <h2 className="font-semibold">{translateValue('5×5 Risk Matrix')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {translateValue(
              'Likelihood × Severity = Score. Ratings are shown as Low, Medium, High, or Critical.',
            )}
          </p>
          <RiskMatrixGrid matrix={matrix} className="mt-4" />
        </section>

        {hazards.map((hazard, index) => (
          <section key={hazard.id ?? index} className="space-y-4 rounded-lg border p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {translateValue('Hazard')} {index + 1}
              </h2>
              {!hazard.id && hazards.length > 1 && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setHazards((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  {translateValue('Remove')}
                </Button>
              )}
            </div>
            <label className="block text-sm font-medium">
              {translateValue('Hazard')}
              <input
                className="bg-background mt-1 w-full rounded-md border px-3 py-2"
                value={hazard.hazardDescription}
                onChange={(event) => changeHazard(index, { hazardDescription: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              {translateValue('How harm may occur')}
              <textarea
                className="bg-background mt-1 min-h-20 w-full rounded-md border px-3 py-2"
                value={hazard.harmDescription}
                onChange={(event) => changeHazard(index, { harmDescription: event.target.value })}
              />
            </label>
            <PeopleAtRiskField
              value={hazard.peopleAtRisk}
              onChange={(peopleAtRisk) => changeHazard(index, { peopleAtRisk })}
            />
            <div className="grid gap-3 md:grid-cols-2">
              {numberField(
                'Initial likelihood',
                hazard.initialLikelihood,
                matrix.axes.likelihood.values.length,
                (initialLikelihood) => changeHazard(index, { initialLikelihood }),
              )}
              {numberField(
                'Initial severity',
                hazard.initialSeverity,
                matrix.axes.severity.values.length,
                (initialSeverity) => changeHazard(index, { initialSeverity }),
              )}
            </div>
            <RiskScoreBadge
              likelihood={hazard.initialLikelihood}
              severity={hazard.initialSeverity}
              prefix={translateValue('Initial risk')}
            />
            <label className="block text-sm font-medium">
              {translateValue('Safe System of Work / controls')}
              <textarea
                className="bg-background mt-1 min-h-28 w-full rounded-md border px-3 py-2"
                value={hazard.controls}
                onChange={(event) => changeHazard(index, { controls: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              {translateValue('Additional controls / further actions')}
              <textarea
                className="bg-background mt-1 min-h-20 w-full rounded-md border px-3 py-2"
                value={hazard.additionalControls ?? ''}
                onChange={(event) =>
                  changeHazard(index, { additionalControls: event.target.value })
                }
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              {numberField(
                'Residual likelihood',
                hazard.residualLikelihood,
                matrix.axes.likelihood.values.length,
                (residualLikelihood) => changeHazard(index, { residualLikelihood }),
              )}
              {numberField(
                'Residual severity',
                hazard.residualSeverity,
                matrix.axes.severity.values.length,
                (residualSeverity) => changeHazard(index, { residualSeverity }),
              )}
            </div>
            <RiskScoreBadge
              likelihood={hazard.residualLikelihood}
              severity={hazard.residualSeverity}
              prefix={translateValue('Residual risk')}
            />
            {hazard.additionalControls && (
              <Button variant="outline" onClick={() => createAction(hazard)} disabled={pending}>
                {translateValue('Create corrective action')}
              </Button>
            )}
          </section>
        ))}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => setHazards((current) => [...current, blankHazard()])}
          >
            {translateValue('Add hazard')}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? translateValue('Saving…') : translateValue('Save assessment')}
          </Button>
        </div>
      </fieldset>
    </RiskMatrixProvider>
  )
}

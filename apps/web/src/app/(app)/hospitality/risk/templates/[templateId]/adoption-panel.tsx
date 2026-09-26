'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Select } from '@beaconhs/ui'
import { toast } from '@/lib/toast'
import { useGeneratedValueTranslations } from '@/i18n/generated'
import { adoptRiskAssessmentAction } from '../../actions'

export function AdoptionPanel({
  templateId,
  templateTitle,
  activePropertyId,
  properties,
}: {
  templateId: string
  templateTitle: string
  activePropertyId: string | null
  properties: { id: string; name: string }[]
}) {
  const router = useRouter()
  const translateValue = useGeneratedValueTranslations()
  const [pending, start] = useTransition()
  const [propertyId, setPropertyId] = useState(activePropertyId ?? properties[0]?.id ?? '')

  function adopt() {
    if (!propertyId) {
      toast.error(translateValue('Choose a property before adoption.'))
      return
    }
    start(async () => {
      try {
        const result = await adoptRiskAssessmentAction({
          templateId,
          propertyId,
          title: templateTitle,
        })
        toast.success(translateValue('Risk assessment adopted.'))
        router.push(`/hospitality/risk/assessments/${result.assessmentId}`)
      } catch {
        toast.error(translateValue('The risk assessment could not be adopted.'))
      }
    })
  }

  return (
    <div className="rounded-lg border p-5">
      <h2 className="font-semibold">{translateValue('Adopt Risk Assessment')}</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {translateValue(
          'Create a property-owned copy with an immutable snapshot of this template version.',
        )}
      </p>
      {properties.length > 1 || !activePropertyId ? (
        <label className="mt-4 block text-sm font-medium">
          {translateValue('Property')}
          <Select
            className="bg-background mt-1 w-full rounded-md border px-3 py-2"
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
          >
            <option value="">{translateValue('Choose a property')}</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <p className="mt-4 text-sm">
          {translateValue('Property')}: <strong>{properties[0]?.name}</strong>
        </p>
      )}
      <Button className="mt-4" onClick={adopt} disabled={pending || !propertyId}>
        {pending ? translateValue('Adopting…') : translateValue('Adopt Risk Assessment')}
      </Button>
    </div>
  )
}

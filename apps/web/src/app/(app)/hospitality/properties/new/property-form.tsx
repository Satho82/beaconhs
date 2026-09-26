'use client'

import { useActionState, useState } from 'react'
import { Button, Input, Label } from '@beaconhs/ui'
import { useGeneratedValueTranslations } from '@/i18n/generated'
import { createPropertyAction } from '../actions'

export function PropertyForm({ timezone }: { timezone: string }) {
  const t = useGeneratedValueTranslations()
  const [state, action, pending] = useActionState(createPropertyAction, {})
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [zone, setZone] = useState(timezone)
  return (
    <form action={action} className="grid gap-4 rounded-lg border p-4">
      <Label htmlFor="property-name">{t('Property name')}</Label>
      <Input
        id="property-name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        maxLength={200}
        autoComplete="organization"
      />
      <Label htmlFor="property-code">{t('Property code')}</Label>
      <Input
        id="property-code"
        name="code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
        maxLength={80}
      />
      <Label htmlFor="property-timezone">{t('Timezone')}</Label>
      <Input
        id="property-timezone"
        name="timezone"
        value={zone}
        onChange={(event) => setZone(event.target.value)}
        required
        maxLength={100}
      />
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error === 'invalid_input'
            ? t('Enter the property name, code, and a valid IANA timezone.')
            : t('Unable to create the property. Check your access and try again.')}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? t('Creating property…') : t('Create property')}
      </Button>
    </form>
  )
}

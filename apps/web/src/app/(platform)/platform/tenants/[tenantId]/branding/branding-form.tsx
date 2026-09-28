'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Input, Label } from '@beaconhs/ui'
import { GeneratedValue, useGeneratedTranslations } from '@/i18n/generated'
import { saveTenantBranding, type TenantBrandingFormState } from './_actions'

const initial: TenantBrandingFormState = { status: 'idle' }

const OUTCOME_MESSAGE = {
  saved: 'm_051825a3a935e6',
  invalid_tenant: 'm_1212f7b541f3b2',
  invalid_hex: 'm_1e3d568542da31',
  invalid_asset: 'm_09913fda1a793c',
  save_failed: 'm_1abc419dfa0297',
} as const

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      <GeneratedValue value={pending ? 'Saving…' : 'Save branding'} />
    </Button>
  )
}

export function TenantBrandingForm({
  tenantId,
  primaryColor,
  logoUrl,
  letterheadUrl,
}: {
  tenantId: string
  primaryColor?: string
  logoUrl?: string
  letterheadUrl?: string
}) {
  const [state, action] = useActionState(saveTenantBranding, initial)
  const t = useGeneratedTranslations()
  const [colour, setColour] = useState(primaryColor || '#1B2B4A')
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="tenantId" value={tenantId} />
      <section className="space-y-2">
        <Label htmlFor="logo">
          <GeneratedValue value="Tenant logo" />
        </Label>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={t('m_10ea303d269ef1')}
            className="h-16 max-w-56 rounded border object-contain p-1"
          />
        ) : (
          <p className="text-sm text-slate-500">
            <GeneratedValue value="Using the Platform/Uvanoo default logo." />
          </p>
        )}
        <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
        <p className="text-xs text-slate-500">
          <GeneratedValue value="PNG, JPEG or WebP; maximum 2 MB." />
        </p>
        {logoUrl ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="resetLogo" value="1" />{' '}
            <GeneratedValue value="Remove and use the default" />
          </label>
        ) : null}
      </section>
      <section className="space-y-2">
        <Label htmlFor="primaryColor">
          <GeneratedValue value="Primary colour" />
        </Label>
        <div className="flex gap-2">
          <Input
            id="primaryColor"
            type="color"
            value={colour}
            onChange={(event) => setColour(event.target.value.toUpperCase())}
            className="h-10 w-14 p-1"
          />
          <Input
            name="primaryColor"
            value={colour}
            onChange={(event) => setColour(event.target.value.toUpperCase())}
            pattern="#[0-9A-Fa-f]{6}"
          />
        </div>
        <p className="text-xs text-slate-500">
          <GeneratedValue value="Use a six-digit HEX value. Clear the field to return to the default." />
        </p>
      </section>
      <section className="space-y-2">
        <Label htmlFor="letterhead">
          <GeneratedValue value="PDF letterhead" />
        </Label>
        {letterheadUrl ? (
          <a className="text-sm text-teal-700 underline" href={letterheadUrl} target="_blank">
            <GeneratedValue value="View configured letterhead" />
          </a>
        ) : (
          <p className="text-sm text-slate-500">
            <GeneratedValue value="No tenant letterhead configured." />
          </p>
        )}
        <Input id="letterhead" name="letterhead" type="file" accept="application/pdf" />
        <p className="text-xs text-slate-500">
          <GeneratedValue value="PDF only; maximum 5 MB." />
        </p>
        {letterheadUrl ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="resetLetterhead" value="1" />{' '}
            <GeneratedValue value="Remove letterhead" />
          </label>
        ) : null}
      </section>
      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-red-600">
          {state.outcome ? t(OUTCOME_MESSAGE[state.outcome]) : null}
        </p>
      ) : null}
      {state.status === 'success' ? (
        <p role="status" className="text-sm text-emerald-700">
          {state.outcome ? t(OUTCOME_MESSAGE[state.outcome]) : null}
        </p>
      ) : null}
      <Submit />
    </form>
  )
}

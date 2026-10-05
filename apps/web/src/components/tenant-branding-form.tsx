'use client'

import { useRef, useState } from 'react'
import { Button, Input, Label } from '@beaconhs/ui'
import { GeneratedValue, useGeneratedTranslations } from '@/i18n/generated'
import type { TenantBrandingFormState } from '@/lib/tenant-branding-form-state'
import { useUnsavedChanges } from '@/lib/use-unsaved-changes'
import { useRouter } from 'next/navigation'

const initial: TenantBrandingFormState = { status: 'idle' }

const OUTCOME_MESSAGE = {
  saved: 'm_051825a3a935e6',
  invalid_tenant: 'm_1212f7b541f3b2',
  invalid_hex: 'm_1e3d568542da31',
  invalid_asset: 'm_09913fda1a793c',
  save_failed: 'm_1abc419dfa0297',
} as const

export function TenantBrandingForm({
  tenantId,
  tenantName,
  saveAction,
  primaryColor,
  logoUrl,
  letterheadUrl,
  hasLogo = !!logoUrl,
  hasLetterhead = !!letterheadUrl,
}: {
  tenantId: string
  tenantName: string
  saveAction: (
    previous: TenantBrandingFormState,
    data: FormData,
  ) => Promise<TenantBrandingFormState>
  primaryColor?: string
  logoUrl?: string
  letterheadUrl?: string
  hasLogo?: boolean
  hasLetterhead?: boolean
}) {
  const [state, setState] = useState(initial)
  const [pending, setPending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()
  useUnsavedChanges(dirty)
  const t = useGeneratedTranslations()
  const [colour, setColour] = useState(primaryColor || '')
  return (
    <form
      ref={formRef}
      onInput={() => setDirty(true)}
      onChange={() => setDirty(true)}
      onSubmit={async (event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setPending(true)
        try {
          const result = await saveAction(initial, data)
          setState(result)
          if (result.status === 'success') {
            setDirty(false)
            router.refresh()
          }
        } catch {
          setState({ status: 'error', outcome: 'save_failed' })
        } finally {
          setPending(false)
        }
      }}
      className="space-y-6"
    >
      <p className="text-sm text-slate-600">{tenantName} · Changes apply to this tenant.</p>
      <input type="hidden" name="tenantId" value={tenantId} />
      <fieldset disabled={pending} className="space-y-6">
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
              {hasLogo
                ? 'An existing logo is configured but cannot be previewed here. Upload to replace it.'
                : 'Using the Platform/Uvanoo default logo.'}
            </p>
          )}
          <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
          <p className="text-xs text-slate-500">
            <GeneratedValue value="PNG, JPEG or WebP; maximum 2 MB." />
          </p>
          {hasLogo ? (
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
              value={/^#[0-9a-f]{6}$/i.test(colour) ? colour : '#0f766e'}
              onChange={(event) => setColour(event.target.value.toUpperCase())}
              className="h-10 w-14 p-1"
            />
            <Input
              aria-label="Tenant accent HEX colour"
              aria-invalid={state.status === 'error' && state.outcome === 'invalid_hex'}
              aria-describedby={state.status === 'error' ? 'branding-result' : undefined}
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
            <a
              className="text-sm text-teal-700 underline"
              href={letterheadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GeneratedValue value="View configured letterhead" />
            </a>
          ) : (
            <p className="text-sm text-slate-500">
              {hasLetterhead
                ? 'An existing letterhead is configured but cannot be previewed here. Upload to replace it.'
                : 'No tenant letterhead configured.'}
            </p>
          )}
          <Input id="letterhead" name="letterhead" type="file" accept="application/pdf" />
          <p className="text-xs text-slate-500">
            <GeneratedValue value="PDF only; maximum 5 MB." />
          </p>
          {hasLetterhead ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="resetLetterhead" value="1" />{' '}
              <GeneratedValue value="Remove letterhead" />
            </label>
          ) : null}
        </section>
      </fieldset>
      {state.status === 'error' ? (
        <p id="branding-result" role="alert" className="text-sm text-red-600">
          {state.outcome ? t(OUTCOME_MESSAGE[state.outcome]) : null}
        </p>
      ) : null}
      {state.status === 'success' ? (
        <p role="status" className="text-sm text-emerald-700">
          {state.outcome ? t(OUTCOME_MESSAGE[state.outcome]) : null}
        </p>
      ) : null}
      <section aria-label="Tenant identity preview" className="rounded-xl border p-4">
        <p className="text-xs text-slate-500">Tenant identity preview</p>
        <p
          className="mt-2 font-semibold"
          style={{
            borderLeft: `4px solid ${/^#[0-9a-f]{6}$/i.test(colour) ? colour : '#0f766e'}`,
            paddingLeft: '0.75rem',
          }}
        >
          {tenantName}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          The master Uvanoo identity, favicon and browser title remain platform-controlled.
        </p>
      </section>
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || pending}
          onClick={() => {
            formRef.current?.reset()
            setColour(primaryColor ?? '')
            setDirty(false)
            setState(initial)
          }}
        >
          Discard
        </Button>
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? 'Saving…' : 'Save branding'}
        </Button>
      </div>
    </form>
  )
}

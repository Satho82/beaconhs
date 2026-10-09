'use client'
import { PRODUCT_NAME } from '@/lib/brand'
import { useGeneratedValueTranslations } from '@/i18n/generated'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Button, Input, Label } from '@beaconhs/ui'
import { GeneratedValue, useGeneratedTranslations } from '@/i18n/generated'
import type { TenantBrandingFormState } from '@/lib/tenant-branding-form-state'
import { useUnsavedChanges } from '@/lib/use-unsaved-changes'
import { useRouter } from 'next/navigation'
import {
  Building2,
  ClipboardList,
  ShieldCheck,
  Wrench,
  Home,
  Users,
  Check,
  Info,
} from 'lucide-react'

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
  platformPrimaryColor = '#0F766E',
  platformLogoUrl,
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
  platformPrimaryColor?: string
  platformLogoUrl?: string
  letterheadUrl?: string
  hasLogo?: boolean
  hasLetterhead?: boolean
}) {
  const tBoard = useGeneratedValueTranslations()

  const [state, setState] = useState(initial)
  const [pending, setPending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()
  useUnsavedChanges(dirty)
  const t = useGeneratedTranslations()
  const [colour, setColour] = useState(primaryColor || '')
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [uploadedLogo, setUploadedLogo] = useState<string>()
  const [resetLogo, setResetLogo] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  function setLogoFile(file: File | null) {
    setUploadedLogo(file ? URL.createObjectURL(file) : undefined)
  }
  useEffect(
    () => () => {
      if (uploadedLogo) URL.revokeObjectURL(uploadedLogo)
    },
    [uploadedLogo],
  )
  const previewLogo = resetLogo ? platformLogoUrl : (uploadedLogo ?? logoUrl ?? platformLogoUrl)
  const previewColour = /^#[0-9a-f]{6}$/i.test(colour) ? colour : platformPrimaryColor

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
      <p className="text-sm text-slate-600">
        {tenantName} {tBoard('· Changes apply to this tenant.')}
      </p>
      <input type="hidden" name="tenantId" value={tenantId} />
      {!hasLogo && resetLogo && <input type="hidden" name="resetLogo" value="1" />}
      <nav
        aria-label={tBoard('Branding sections')}
        className="flex gap-6 overflow-x-auto border-b border-blue-100 pb-3 text-sm text-blue-600"
      >
        <a href="#brand-identity" className="whitespace-nowrap">
          {tBoard('Brand Identity')}
        </a>
        <a href="#brand-colours">{tBoard('Colours')}</a>
        <a href="#brand-documents">{tBoard('Documents')}</a>
      </nav>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
        <fieldset
          disabled={pending}
          className="space-y-6 rounded-lg border border-blue-100 bg-white p-5 dark:bg-slate-900"
        >
          <section id="brand-identity" className="scroll-mt-5 space-y-3">
            <h3 className="text-lg font-semibold">{tBoard('Logo')}</h3>
            <p className="text-sm text-slate-500">
              {tBoard('Upload your organisation logo for the application interface.')}
            </p>
            <Label htmlFor="logo">
              <GeneratedValue value="Tenant logo" />
            </Label>
            {logoUrl ? (
              <Image
                unoptimized
                width={224}
                height={64}
                src={logoUrl}
                alt={t('m_10ea303d269ef1')}
                className="h-16 max-w-56 rounded border object-contain p-1"
              />
            ) : (
              <p className="text-sm text-slate-500">
                {hasLogo
                  ? tBoard(
                      'An existing logo is configured but cannot be previewed here. Upload to replace it.',
                    )
                  : tBoard('Using the Platform/Uvanoo default logo.')}
              </p>
            )}
            <Input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.item(0) ?? null
                const validFile =
                  file &&
                  file.size <= 2 * 1024 * 1024 &&
                  ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
                    ? file
                    : null
                setLogoFile(validFile)
                if (validFile) setResetLogo(false)
              }}
            />
            <p className="text-xs text-slate-500">
              <GeneratedValue value="PNG, JPEG or WebP; maximum 2 MB." />
            </p>
            {hasLogo ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="resetLogo"
                  value="1"
                  checked={resetLogo}
                  onChange={(event) => setResetLogo(event.target.checked)}
                />{' '}
                <GeneratedValue value="Remove and use the default" />
              </label>
            ) : null}
          </section>
          <section
            id="brand-colours"
            className="scroll-mt-5 space-y-4 border-t border-blue-100 pt-5"
          >
            <Label htmlFor="primaryColor">
              <GeneratedValue value="Primary colour" />
            </Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="primaryColor"
                type="color"
                value={previewColour}
                onChange={(event) => setColour(event.target.value.toUpperCase())}
                className="h-10 w-14 p-1"
              />
              <Input
                aria-label={tBoard('Primary HEX colour')}
                aria-invalid={state.status === 'error' && state.outcome === 'invalid_hex'}
                aria-describedby={state.status === 'error' ? 'branding-result' : undefined}
                name="primaryColor"
                className="min-w-32 flex-1"
                value={colour}
                onChange={(event) => setColour(event.target.value.toUpperCase())}
                pattern="#[0-9A-Fa-f]{6}"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!!colour && !/^#[0-9a-f]{6}$/i.test(colour)}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(previewColour)
                    setCopyMessage(`${tBoard('Copied colour')}: ${previewColour}`)
                  } catch {
                    setCopyMessage(
                      tBoard('Could not copy. Select and copy the HEX value manually.'),
                    )
                  }
                }}
              >
                {tBoard('Copy colour')}
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">{tBoard('Suggested colours')}</p>
              <div className="flex flex-wrap gap-2">
                {['#0066FF', '#14B8A6', '#103956', '#FF7165', '#8560B5', '#64748B'].map(
                  (swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      aria-label={`${tBoard('Use colour')} ${swatch}`}
                      aria-pressed={colour.toUpperCase() === swatch}
                      onClick={() => {
                        setColour(swatch)
                        setDirty(true)
                      }}
                      style={{ backgroundColor: swatch }}
                      className="grid h-9 w-9 place-items-center rounded-md border-2 border-white text-white ring-1 ring-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      {colour.toUpperCase() === swatch && <Check size={18} />}
                    </button>
                  ),
                )}
              </div>
            </div>
            {copyMessage && (
              <p role="status" className="text-xs text-slate-600">
                {copyMessage}
              </p>
            )}
            <p className="text-xs text-slate-500">
              <GeneratedValue value="Use a six-digit HEX value. Clear the field to return to the default." />
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-slate-500">
                {colour ? tBoard('Custom colour') : tBoard('Using the platform default colour.')}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={!colour}
                onClick={() => {
                  setColour('')
                  setCopyMessage('')
                  setDirty(true)
                }}
              >
                {tBoard('Reset to Platform Default')}
              </Button>
            </div>
          </section>
          <section
            id="brand-documents"
            className="scroll-mt-5 space-y-3 border-t border-blue-100 pt-5"
          >
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
                  ? tBoard(
                      'An existing letterhead is configured but cannot be previewed here. Upload to replace it.',
                    )
                  : tBoard('No tenant letterhead configured.')}
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
        <section
          aria-label={tBoard('Tenant identity preview')}
          className="min-w-0 rounded-lg border border-blue-100 bg-white p-4 dark:bg-slate-950"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">{tBoard('Live Preview')}</h3>
            <div className="flex gap-2">
              {(['desktop', 'mobile'] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant="outline"
                  aria-pressed={previewMode === mode}
                  onClick={() => setPreviewMode(mode)}
                >
                  {mode === 'desktop' ? tBoard('Desktop') : tBoard('Mobile')}
                </Button>
              ))}
            </div>
          </div>
          <div
            className={
              previewMode === 'mobile'
                ? 'mx-auto max-w-64 overflow-hidden rounded-lg border bg-white'
                : 'overflow-hidden rounded-lg border bg-white'
            }
          >
            <div className="flex min-h-16 items-center gap-3 bg-[#eef5f9] p-4 text-[#103153]">
              {previewLogo ? (
                <Image
                  unoptimized
                  width={224}
                  height={64}
                  src={previewLogo}
                  alt={tenantName}
                  className="h-9 max-w-32 object-contain"
                />
              ) : (
                <span className="font-semibold">{PRODUCT_NAME}</span>
              )}
            </div>
            <div className={previewMode === 'desktop' ? 'grid grid-cols-[7rem_1fr]' : ''}>
              {previewMode === 'desktop' && (
                <div className="space-y-4 bg-[#eef5f9] px-3 py-5 text-[11px] text-[#103153]">
                  {[
                    { label: 'Dashboard', icon: Home },
                    { label: 'Properties', icon: Building2 },
                    { label: 'People', icon: Users },
                    { label: 'Compliance', icon: ShieldCheck },
                    { label: 'Maintenance', icon: Wrench },
                  ].map(({ label, icon: Icon }) => (
                    <div key={label} className="flex items-center gap-2">
                      <Icon size={14} />
                      <span>{tBoard(label)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-4 p-5">
                <div className="rounded-lg bg-gradient-to-r from-blue-50 to-teal-50 p-4">
                  <h4 className="font-semibold text-slate-900">{tenantName}</h4>
                  <p className="mt-1 text-xs text-slate-600">
                    {tBoard('Branding preview — sample layout, not live operational data.')}
                  </p>
                </div>
                <div className={previewMode === 'desktop' ? 'grid grid-cols-3 gap-2' : 'space-y-2'}>
                  {[
                    { label: 'Maintenance', icon: Wrench },
                    { label: 'Compliance', icon: ShieldCheck },
                    { label: 'Tasks', icon: ClipboardList },
                  ].map(({ label, icon: Icon }) => (
                    <div
                      key={label}
                      className="space-y-3 rounded border border-blue-100 p-3 text-xs"
                    >
                      <span>{tBoard(label)}</span>
                      <Icon size={24} style={{ color: previewColour }} />
                    </div>
                  ))}
                </div>
                <div
                  className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700"
                  style={{ borderTop: `3px solid ${previewColour}` }}
                >
                  {tBoard('Your tenant identity')}
                </div>
                <span
                  className="inline-block rounded-md px-4 py-2 text-sm font-semibold"
                  style={{ color: previewColour, border: `1px solid ${previewColour}` }}
                >
                  {tBoard('Primary colour')}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {tBoard('Preview only. Save to apply your changes.')}
          </p>
          <div className="mt-5 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-[#546f9c]">
            <h4 className="mb-2 flex items-center gap-2 font-semibold text-[#101b55]">
              <Info size={18} />
              {tBoard('Where your branding is applied')}
            </h4>
            <p>
              {tBoard(
                'The logo and primary colour apply to your tenant application. The document upload controls your PDF letterhead. Tenant-specific login branding and secondary-colour settings are not yet supported.',
              )}
            </p>
          </div>
        </section>
      </div>
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
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setColour('')
            setCopyMessage('')
            setResetLogo(true)
            setLogoFile(null)
            setDirty(true)
            const logoInput = formRef.current?.elements.namedItem('logo')
            if (logoInput instanceof HTMLInputElement) logoInput.value = ''
          }}
        >
          {tBoard('Reset to Default')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || pending}
          onClick={() => {
            formRef.current?.reset()
            setColour(primaryColor ?? '')
            setCopyMessage('')
            setResetLogo(false)
            setLogoFile(null)
            setDirty(false)
            setState(initial)
          }}
        >
          {tBoard('Discard')}
        </Button>
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? tBoard('Saving…') : tBoard('Save branding')}
        </Button>
      </div>
    </form>
  )
}

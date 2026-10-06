'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@beaconhs/ui'
import { useGeneratedValueTranslations } from '@/i18n/generated'
import { useUnsavedChanges } from '@/lib/use-unsaved-changes'

export function PlatformBrandingForm({
  action,
  children,
}: {
  action: (data: FormData) => Promise<void>
  children: React.ReactNode
}) {
  const t = useGeneratedValueTranslations()
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<'saved' | 'failed' | null>(null)
  useUnsavedChanges(dirty)
  return (
    <form
      ref={form}
      className="space-y-6"
      onInput={() => setDirty(true)}
      onChange={() => {
        setDirty(true)
        setOutcome(null)
      }}
      onSubmit={async (event) => {
        event.preventDefault()
        const submitter = (event.nativeEvent as SubmitEvent).submitter
        const data = new FormData(event.currentTarget)
        if (submitter instanceof HTMLButtonElement && submitter.name)
          data.set(submitter.name, submitter.value)
        setPending(true)
        setOutcome(null)
        try {
          await action(data)
          setDirty(false)
          setOutcome('saved')
          router.refresh()
        } catch {
          setOutcome('failed')
        } finally {
          setPending(false)
        }
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-8">
        {children}
      </fieldset>
      {outcome && (
        <p
          role={outcome === 'saved' ? 'status' : 'alert'}
          className="rounded-lg border p-3 text-sm"
        >
          {outcome === 'saved'
            ? t('Settings saved.')
            : t(
                'Unable to save settings. Your changes are still here. Check the values and try again.',
              )}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || pending}
          onClick={() => {
            form.current?.reset()
            setDirty(false)
            setOutcome(null)
          }}
        >
          {t('Discard')}
        </Button>
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? t('Saving…') : t('Save branding')}
        </Button>
      </div>
    </form>
  )
}

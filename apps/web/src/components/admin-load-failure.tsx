'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@beaconhs/ui'
import { useGeneratedValueTranslations } from '@/i18n/generated'

/** Fixed copy only: never render exception messages, database details or stacks. */
export function AdminLoadFailure({ reset }: { reset?: () => void }) {
  const t = useGeneratedValueTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <section
      role="alert"
      aria-busy={pending}
      className="my-5 space-y-3 rounded-xl border border-red-200 bg-white p-5 dark:border-red-900 dark:bg-slate-900"
    >
      <h2 className="text-lg font-semibold">{t('Unable to load this configuration')}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {t('Retry to load the saved settings before making changes.')}
      </p>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            router.refresh()
            reset?.()
          })
        }
      >
        {pending ? t('Loading…') : t('Retry')}
      </Button>
    </section>
  )
}

'use client'

import { useRef, useState } from 'react'
import { Button, cn } from '@beaconhs/ui'

type SettingsFormProps = {
  action: (formData: FormData) => void | Promise<void>
  saveLabel: string
  discardLabel: string
  navigationLabel: string
  sections: { id: string; label: string }[]
  children: React.ReactNode
}

/**
 * A small client boundary around the existing server action. It deliberately
 * does not own any settings state: native form controls remain the source of
 * truth and the established server action still performs validation, RBAC,
 * persistence and audit recording.
 */
export function SettingsForm({
  action,
  saveLabel,
  discardLabel,
  navigationLabel,
  sections,
  children,
}: SettingsFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [dirty, setDirty] = useState(false)

  return (
    <form
      ref={formRef}
      action={action}
      onInput={() => setDirty(true)}
      onChange={() => setDirty(true)}
      className="space-y-6"
    >
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <aside className="mb-5 lg:mb-0">
          <nav
            aria-label={navigationLabel}
            className="flex gap-1 overflow-x-auto rounded-xl border border-orange-100 bg-orange-50/60 p-1.5 lg:sticky lg:top-5 lg:flex-col lg:overflow-visible"
          >
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white hover:text-orange-800 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none lg:w-full"
              >
                {section.label}
              </a>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 space-y-5">{children}</div>
      </div>

      <div
        className={cn(
          'sticky bottom-3 z-10 flex items-center justify-end gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur',
          dirty
            ? 'border-orange-200 bg-white/95'
            : 'border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90',
        )}
      >
        <Button
          type="button"
          variant="outline"
          disabled={!dirty}
          onClick={() => {
            formRef.current?.reset()
            setDirty(false)
          }}
        >
          {discardLabel}
        </Button>
        <Button
          type="submit"
          disabled={!dirty}
          className="bg-orange-600 hover:bg-orange-700 active:bg-orange-800"
        >
          {saveLabel}
        </Button>
      </div>
    </form>
  )
}

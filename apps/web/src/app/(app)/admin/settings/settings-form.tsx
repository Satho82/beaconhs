'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, cn } from '@beaconhs/ui'
import { Bell, Cable, Cog, Palette, Settings2 } from 'lucide-react'

const SETTINGS_DESTINATIONS = {
  general: '/admin/settings',
  branding: '/admin/settings/branding',
  notifications: '/admin/notifications',
  integrations: '/admin/integrations',
  advanced: '/admin/settings/advanced',
} as const

type SettingsFormProps = {
  action: (formData: FormData) => void | Promise<void>
  saveLabel: string
  discardLabel: string
  navigationLabel: string
  activeSection?: keyof typeof SETTINGS_DESTINATIONS
  sidebar?: React.ReactNode
  children: React.ReactNode
}

export function SettingsNavigation({
  navigationLabel,
  activeSection,
}: {
  navigationLabel: string
  activeSection: keyof typeof SETTINGS_DESTINATIONS
}) {
  const t = useTranslations('TenantSettings')

  return (
    <nav
      aria-label={navigationLabel}
      className="flex gap-1 overflow-x-auto border-b border-blue-100 pb-px"
    >
      {[
        ['general', Settings2],
        ['branding', Palette],
        ['notifications', Bell],
        ['integrations', Cable],
        ['advanced', Cog],
      ].map(([section, Icon]) => {
        const active = activeSection === section
        return (
          <a
            key={section}
            href={SETTINGS_DESTINATIONS[section as keyof typeof SETTINGS_DESTINATIONS]}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm hover:text-blue-700',
              active
                ? 'border-blue-600 font-semibold text-blue-700'
                : 'border-transparent font-medium text-slate-700',
            )}
          >
            <Icon size={18} />
            {t(section)}
          </a>
        )
      })}
    </nav>
  )
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
  activeSection = 'general',
  sidebar,
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
      <SettingsNavigation navigationLabel={navigationLabel} activeSection={activeSection} />
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_25rem] xl:gap-5">
        <div className="min-w-0 space-y-4">{children}</div>
        <aside className="mt-5 space-y-4 xl:mt-0">{sidebar}</aside>
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

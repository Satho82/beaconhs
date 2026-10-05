'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUnsavedChanges } from '@/lib/use-unsaved-changes'
import { useRouter } from 'next/navigation'
import { Button, cn } from '@beaconhs/ui'
import { Bell, Cable, Palette, Settings2, type LucideIcon } from 'lucide-react'

const SETTINGS_DESTINATIONS = {
  general: '/admin/settings',
  branding: '/admin/settings/branding',
  notifications: '/admin/notifications',
  integrations: '/admin/integrations',
  advanced: '/admin/settings/advanced',
  importExport: '/admin/settings/import-export',
} as const

type SettingsSection = keyof typeof SETTINGS_DESTINATIONS

type SettingsNavigationEntry = {
  id: SettingsSection
  label: SettingsSection
  href: (typeof SETTINGS_DESTINATIONS)[SettingsSection]
  icon: LucideIcon
}

const SETTINGS_NAVIGATION: readonly SettingsNavigationEntry[] = [
  { id: 'general', label: 'general', href: '/admin/settings', icon: Settings2 },
  { id: 'branding', label: 'branding', href: '/admin/settings/branding', icon: Palette },
  { id: 'notifications', label: 'notifications', href: '/admin/notifications', icon: Bell },
  { id: 'integrations', label: 'integrations', href: '/admin/integrations', icon: Cable },
]

type SettingsFormProps = {
  action: (formData: FormData) => void | Promise<void>
  saveLabel: string
  discardLabel: string
  navigationLabel: string
  activeSection?: SettingsSection
  sidebar?: React.ReactNode
  children: React.ReactNode
}

export function SettingsNavigation({
  navigationLabel,
  activeSection,
}: {
  navigationLabel: string
  activeSection: SettingsSection
}) {
  const t = useTranslations('TenantSettings')

  return (
    <nav
      aria-label={navigationLabel}
      className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-px"
    >
      {SETTINGS_NAVIGATION.map((entry) => {
        const active = activeSection === entry.id
        const Icon = entry.icon
        return (
          <a
            key={entry.id}
            href={entry.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm hover:text-teal-700',
              active
                ? 'border-teal-600 font-semibold text-teal-700'
                : 'border-transparent font-medium text-slate-700',
            )}
          >
            <Icon size={18} />
            {t(entry.label)}
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
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  useUnsavedChanges(dirty)
  async function submit(formData: FormData) {
    setPending(true)
    setMessage('')
    try {
      await action(formData)
      setDirty(false)
      setMessage('Settings saved.')
      router.refresh()
    } catch {
      setMessage(
        'Unable to save settings. Your changes are still here. Check the values and try again.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(event) => {
        event.preventDefault()
        void submit(new FormData(event.currentTarget))
      }}
      onInput={() => setDirty(true)}
      onChange={() => {
        setDirty(true)
        setMessage('')
      }}
      className="space-y-6"
    >
      <input type="hidden" name="settingsSection" value="general" />
      {message && (
        <p role={dirty ? 'alert' : 'status'} className="rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
      <SettingsNavigation navigationLabel={navigationLabel} activeSection={activeSection} />
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_25rem] xl:gap-5">
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          {children}
        </fieldset>
        <aside className="mt-5 space-y-4 xl:mt-0">{sidebar}</aside>
      </div>

      <div
        className={cn(
          'sticky bottom-3 z-10 flex items-center justify-end gap-3 rounded-xl border px-4 py-3 shadow-sm backdrop-blur',
          dirty
            ? 'border-orange-200 bg-white/95'
            : 'border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90',
        )}
      >
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || pending}
          onClick={() => {
            formRef.current?.reset()
            setDirty(false)
            setMessage('')
          }}
        >
          {discardLabel}
        </Button>
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? 'Saving…' : saveLabel}
        </Button>
      </div>
    </form>
  )
}

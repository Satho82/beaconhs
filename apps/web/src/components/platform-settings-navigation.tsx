import { useGeneratedValueTranslations } from '@/i18n/generated'
import Link from 'next/link'
import { Bell, Link2, Paintbrush, Settings, SlidersHorizontal } from 'lucide-react'
import { GeneratedValue } from '@/i18n/generated'

const tabs = [
  { label: 'General', href: '/platform/settings', icon: Settings },
  { label: 'Branding', href: '/platform/branding', icon: Paintbrush },
  { label: 'Notifications', href: '/platform/email', icon: Bell },
  { label: 'Integrations', href: '/platform/ai', icon: Link2 },
  { label: 'Advanced', href: '/platform/database', icon: SlidersHorizontal },
] as const

export function PlatformSettingsNavigation({ active }: { active: (typeof tabs)[number]['label'] }) {
  const tVisual = useGeneratedValueTranslations()

  return (
    <nav
      aria-label={tVisual('Platform settings')}
      className="flex gap-2 overflow-x-auto border-b border-blue-100"
    >
      {tabs.map(({ label, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={label === active ? 'page' : undefined}
          className="flex shrink-0 items-center gap-3 border-b-2 border-transparent px-5 py-4 text-sm text-[#516993] hover:text-blue-600 aria-[current=page]:border-blue-600 aria-[current=page]:font-semibold aria-[current=page]:text-blue-600"
        >
          <Icon size={22} />
          <GeneratedValue value={label} />
        </Link>
      ))}
    </nav>
  )
}

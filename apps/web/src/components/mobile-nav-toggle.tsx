'use client'
import { useGeneratedValueTranslations } from '@/i18n/generated'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { Drawer } from '@beaconhs/ui'
import { Logo } from './brand-logo'
import { useMobileNav } from './mobile-nav'
import { SidebarNav, type SidebarNavGroup } from './sidebar-nav'
import { useNavGroups } from './use-platform-nav'
import { ThemeToggle } from './theme-toggle'
import type { PlatformBranding } from '@/lib/platform-branding-config'

export function MobileNavToggle({
  groups,
  platformBranding,
}: {
  groups: SidebarNavGroup[]
  platformBranding?: PlatformBranding
}) {
  const tBoard = useGeneratedValueTranslations()

  const { open, setOpen } = useMobileNav()
  const navGroups = useNavGroups(groups)
  const platform = (usePathname() ?? '').startsWith('/platform')
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tBoard('Open navigation')}
        aria-expanded={open}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-slate-600 lg:hidden dark:text-slate-200"
      >
        <Menu size={20} />
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="left"
        size="sm"
        title={<Logo className="h-7 w-auto" branding={platformBranding} />}
        bodyClassName={
          platform
            ? 'flex min-h-0 flex-1 flex-col bg-[#071f34] text-white'
            : 'flex min-h-0 flex-1 flex-col bg-[#edf5f9] text-[#103153]'
        }
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) setOpen(false)
          }}
        >
          <SidebarNav groups={navGroups} appearance={platform ? 'platform' : 'application'} />
        </div>
        <div className="border-t border-white/10 p-4">
          <ThemeToggle />
        </div>
      </Drawer>
    </>
  )
}

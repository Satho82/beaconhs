'use client'

import { Menu } from 'lucide-react'
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
  const { open, setOpen } = useMobileNav()
  const navGroups = useNavGroups(groups)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
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
        bodyClassName="flex min-h-0 flex-1 flex-col bg-[rgb(var(--color-sidebar))] text-slate-100"
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) setOpen(false)
          }}
        >
          <SidebarNav groups={navGroups} />
        </div>
        <div className="border-t border-white/10 p-4">
          <ThemeToggle />
        </div>
      </Drawer>
    </>
  )
}

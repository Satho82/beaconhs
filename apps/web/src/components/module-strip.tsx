'use client'

import { useGeneratedValueTranslations } from '@/i18n/generated'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  ArrowLeftRight,
  BarChart3,
  BriefcaseMedical,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  Gauge,
  GraduationCap,
  Home,
  Layers,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wrench,
} from 'lucide-react'
import { GeneratedValue } from '@/i18n/generated'
import type { SidebarNavGroup } from './sidebar-nav'
import { findActiveNavHref } from './sidebar-nav-active'

const MODULES = {
  Dashboard: { icon: Home, colour: '#103956' },
  'Daily Hotel': { icon: BarChart3, colour: '#049faf' },
  'Diary & Tasks': { icon: CalendarDays, colour: '#ff7165' },
  Maintenance: { icon: Wrench, colour: '#139b8c' },
  Compliance: { icon: ShieldCheck, colour: '#8560b5' },
  Risk: { icon: TriangleAlert, colour: '#d98239' },
  Inspections: { icon: ClipboardList, colour: '#1986cc' },
  Incidents: { icon: BriefcaseMedical, colour: '#e13840' },
  'Action Plans': { icon: ClipboardCheck, colour: '#0b9ea6' },
  Training: { icon: GraduationCap, colour: '#8560b5' },
  People: { icon: Users, colour: '#0765ae' },
  Handover: { icon: ArrowLeftRight, colour: '#009eb9' },
  'Assets & PPM': { icon: Layers, colour: '#2eb5a5' },
  Metering: { icon: Gauge, colour: '#c59b47' },
  Reporting: { icon: Gauge, colour: '#2993da' },
  Reports: { icon: BarChart3, colour: '#65869c' },
  Approvals: { icon: FileCheck2, colour: '#ff7165' },
  'Tenant Settings': { icon: Settings, colour: '#103956' },
} as const

/** The strip and sidebar receive the same server-filtered tree. No extra capabilities. */
export function ModuleStrip({ groups }: { groups: SidebarNavGroup[] }) {
  const tVisual = useGeneratedValueTranslations()

  const pathname = usePathname() ?? ''
  const search = useSearchParams()
  const activeHref = findActiveNavHref(search?.size ? `${pathname}?${search}` : pathname, groups)
  const activeModule = groups
    .flatMap((group) => group.items)
    .filter((item) => item.moduleKey && findActiveNavHref(activeHref, [{ items: [item] }]) !== null)
    .at(-1)?.moduleKey
  return (
    <nav
      aria-label={tVisual('Application modules')}
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white p-1.5"
      data-walkthrough="module-strip"
    >
      {groups
        .flatMap((group) => group.items)
        .filter((item) => item.moduleKey && item.moduleKey in MODULES)
        .map((item) => {
          const presentation = MODULES[item.moduleKey as keyof typeof MODULES]
          const Icon = presentation.icon
          const active = activeModule === item.moduleKey
          return (
            <Link
              key={item.moduleKey}
              href={item.href as never}
              aria-current={active ? 'true' : undefined}
              style={{ backgroundColor: presentation.colour }}
              className="flex min-h-16 min-w-20 flex-1 flex-col items-center justify-center gap-1 rounded px-2 py-2 text-center text-[11px] font-semibold text-white shadow-[inset_0_0_0_1px_#ffffff44] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-current:shadow-[inset_0_-4px_0_#ffffff]"
            >
              <Icon size={23} aria-hidden />
              <span className="whitespace-nowrap">
                <GeneratedValue value={item.label} />
              </span>
            </Link>
          )
        })}
    </nav>
  )
}

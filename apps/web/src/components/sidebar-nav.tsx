'use client'
import { useGeneratedTranslations } from '@/i18n/generated'

import { GeneratedValue, useGeneratedValueTranslations } from '@/i18n/generated'

import Link from 'next/link'
import { useId, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Award,
  BellRing,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CircleUser,
  ClipboardCheck,
  ClipboardList,
  Construction,
  Database,
  FileText,
  Gauge,
  GraduationCap,
  HardHat,
  Layers,
  LayoutGrid,
  LibraryBig,
  Link2,
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  NotebookPen,
  PanelLeft,
  Plus,
  QrCode,
  Radiation,
  Rss,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Timer,
  Users,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@beaconhs/ui'
import { findActiveNavHref } from './sidebar-nav-active'

// Map string keys → icon components. RSCs can't serialise function references,
// so the parent server component passes us a key and we resolve client-side.
const ICONS: Record<string, LucideIcon> = {
  alert: AlertTriangle,
  award: Award,
  bell: BellRing,
  book: BookOpen,
  building: Building2,
  check: CheckCircle2,
  'circle-help': CircleHelp,
  'circle-user': CircleUser,
  'clipboard-check': ClipboardCheck,
  clipboard: ClipboardList,
  construction: Construction,
  database: Database,
  file: FileText,
  gauge: Gauge,
  grad: GraduationCap,
  grid: LayoutGrid,
  'hard-hat': HardHat,
  layers: Layers,
  library: LibraryBig,
  link: Link2,
  'list-checks': ListChecks,
  mail: Mail,
  pin: MapPin,
  message: MessageSquare,
  journal: NotebookPen,
  'panel-left': PanelLeft,
  plus: Plus,
  'qr-code': QrCode,
  radiation: Radiation,
  rss: Rss,
  scroll: ScrollText,
  settings: Settings,
  shield: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  tag: Tag,
  timer: Timer,
  users: Users,
  workflow: Workflow,
  wrench: Wrench,
}

export type SidebarNavItem = {
  href: string
  label: string
  groupOnly?: boolean
  colour?: 'blue' | 'orange' | 'emerald' | 'rose' | 'purple'
  /** Built-in message key. Omitted for tenant-authored/custom labels. */
  labelKey?: string
  iconKey: keyof typeof ICONS | string
  /** When set, the item is active ONLY on an exact path match (no greedy
   * prefix). Used for hub/overview links that are a prefix of their siblings. */
  exact?: boolean
  /** Children must already be permission/entitlement-filtered by the caller. */
  children?: SidebarNavItem[]
}

export type SidebarNavGroup = {
  label: string
  /** Built-in message key. Omitted for tenant-authored/custom labels. */
  labelKey?: string
  items: SidebarNavItem[]
}

/**
 * Pathname-aware sidebar nav.
 *
 *   • 2px left accent rail on active + hover
 *   • teal-tinted background + label color on active
 *   • smooth colour transitions on hover
 *   • keyboard focus ring tuned to the teal palette
 *
 * The "active" check is greedy: /equipment/123 highlights the /equipment
 * top-level nav item. Sub-routes therefore keep the parent illuminated.
 */
export function SidebarNav({
  groups,
  collapsed = false,
}: {
  groups: SidebarNavGroup[]
  collapsed?: boolean
}) {
  const tBoard = useGeneratedValueTranslations()

  const path = usePathname() ?? ''
  const search = useSearchParams()
  const pathname = search?.size ? `${path}?${search}` : path
  const activeHref = findActiveNavHref(pathname, groups)
  return (
    <nav
      aria-label={tBoard('Application navigation')}
      className="app-scroll flex-1 overflow-y-auto px-3 py-5"
    >
      {groups.map((group) => (
        <section key={group.label} className="mb-6 space-y-1">
          {!collapsed && (
            <h2 className="px-3 pb-2 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              {group.label}
            </h2>
          )}
          {group.items.map((item) => (
            <NavEntry key={item.href} item={item} activeHref={activeHref} collapsed={collapsed} />
          ))}
        </section>
      ))}
    </nav>
  )
}

function NavEntry({
  item,
  activeHref,
  collapsed,
}: {
  item: SidebarNavItem
  activeHref: string | null
  collapsed: boolean
}) {
  const tBoardMessage = useGeneratedTranslations()

  const tGeneratedValue = useGeneratedValueTranslations()
  const id = useId()
  const childActive = item.children
    ? findActiveNavHref(activeHref, [{ items: item.children }]) !== null
    : false
  const [disclosure, setDisclosure] = useState<{ route: string | null; open: boolean } | null>(null)
  const open = disclosure?.route === activeHref ? disclosure.open : childActive
  const setExpanded = (next: boolean) => setDisclosure({ route: activeHref, open: next })
  const active = item.href === activeHref
  const Icon = ICONS[item.iconKey] ?? Gauge
  const iconColour = {
    blue: 'text-blue-300',
    orange: 'text-orange-300',
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    purple: 'text-purple-300',
  }[item.colour ?? 'blue']
  return (
    <div>
      <div className="flex items-center gap-1">
        {item.groupOnly && !collapsed ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setExpanded(!open)}
            className={cn(
              'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-300',
              childActive && 'bg-blue-600/30 font-semibold text-white',
            )}
          >
            <Icon size={18} className={cn('shrink-0', iconColour)} />
            <span className="min-w-0 flex-1 truncate">
              <GeneratedValue value={item.label} />
            </span>
            <ChevronDown size={16} className={open ? 'rotate-180' : ''} />
          </button>
        ) : (
          <Link
            href={item.href as never}
            aria-current={active ? 'page' : undefined}
            title={tGeneratedValue(collapsed ? item.label : undefined)}
            data-walkthrough={`nav:${item.href}`}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300',
              collapsed && 'justify-center px-2',
              active || childActive
                ? 'bg-blue-600/30 font-semibold text-white shadow-[inset_3px_0_0_#60a5fa]'
                : 'text-slate-300 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon size={18} className={cn('shrink-0', iconColour)} />
            {!collapsed && (
              <span className="truncate">
                <GeneratedValue value={item.label} />
              </span>
            )}
          </Link>
        )}
        {!item.groupOnly && !collapsed && Boolean(item.children?.length) && (
          <button
            type="button"
            aria-label={tBoardMessage('m_1a460d455d5128', { value0: tGeneratedValue(item.label) })}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setExpanded(!open)}
            className="rounded p-2 text-slate-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-teal-300"
          >
            <ChevronDown size={16} className={open ? 'rotate-180' : ''} />
          </button>
        )}
      </div>
      {Boolean(item.children?.length) &&
        (!collapsed ? (
          <div id={id} hidden={!open} className="ml-5 border-l border-white/15 pl-2">
            {item.children?.map((child) => (
              <NavEntry key={child.href} item={child} activeHref={activeHref} collapsed={false} />
            ))}
          </div>
        ) : (
          item.children?.map((child) => (
            <NavEntry key={child.href} item={child} activeHref={activeHref} collapsed />
          ))
        ))}
    </div>
  )
}

// --- Shared icon helpers (consumed by the /admin/navigation editor) -------

/** Stable, sorted list of icon keys offered by the nav editor's icon picker. */
export const ICON_KEYS = Object.keys(ICONS).sort()

/** Render a nav icon by its string key (falls back to a neutral gauge). */
export function NavIcon({
  iconKey,
  size = 15,
  className,
}: {
  iconKey: string
  size?: number
  className?: string
}) {
  const Icon = ICONS[iconKey] ?? Gauge
  return <Icon size={size} className={className} />
}

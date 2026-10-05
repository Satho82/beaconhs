'use client'

import { GeneratedValue, useGeneratedValueTranslations } from '@/i18n/generated'

import Link from 'next/link'
import { useId, useState } from 'react'
import { usePathname } from 'next/navigation'
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
  const pathname = usePathname() ?? ''
  const activeHref = findActiveNavHref(pathname, groups)
  return (
    <nav
      aria-label="Application navigation"
      className="app-scroll flex-1 overflow-y-auto px-2 py-4"
    >
      {groups.map((group) => (
        <section key={group.label} className="mb-5">
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
  const tGeneratedValue = useGeneratedValueTranslations()
  const id = useId()
  const childActive = item.children
    ? findActiveNavHref(activeHref, [{ items: item.children }]) !== null
    : false
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const open = expanded ?? childActive
  const active = item.href === activeHref
  const Icon = ICONS[item.iconKey] ?? Gauge
  return (
    <div>
      <div className="flex items-center gap-1">
        <Link
          href={item.href as never}
          aria-current={active ? 'page' : undefined}
          title={tGeneratedValue(collapsed ? item.label : undefined)}
          data-walkthrough={`nav:${item.href}`}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300',
            collapsed && 'justify-center px-2',
            active
              ? 'bg-teal-900 text-white ring-1 ring-teal-700'
              : 'text-slate-300 hover:bg-white/10 hover:text-white',
          )}
        >
          <Icon size={18} className="shrink-0" />
          {!collapsed && (
            <span className="truncate">
              <GeneratedValue value={item.label} />
            </span>
          )}
        </Link>
        {!collapsed && Boolean(item.children?.length) && (
          <button
            type="button"
            aria-label={`Expand ${item.label}`}
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

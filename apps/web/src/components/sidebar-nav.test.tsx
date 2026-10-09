// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))
vi.mock('@/i18n/generated', () => ({
  GeneratedValue: ({ value }: { value: React.ReactNode }) => value,
  useGeneratedTranslations: () => (_key: string, values: { value0: string }) =>
    `Expand ${values.value0}`,
  useGeneratedValueTranslations: () => (value: unknown) => value,
}))
vi.mock('@beaconhs/ui', () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(' ') }))
import { SidebarNav } from './sidebar-nav'
import { approvedNavigation } from '@/lib/nav/approved-structure'
let root: Root
let host: HTMLDivElement
afterEach(async () => {
  if (root) await act(() => root.unmount())
  host?.remove()
})
const groups = [
  {
    label: 'Platform',
    items: [
      {
        href: '/platform/email',
        label: 'Communications',
        iconKey: 'mail',
        children: [{ href: '/platform/sms', label: 'SMS', iconKey: 'message' }],
      },
    ],
  },
]
describe('expandable sidebar', () => {
  it('renders one unified navigation with legacy destinations nested only under modules', async () => {
    const legacyGroups = [
      { label: 'Overview', items: [{ href: '/feed', label: 'Feed', iconKey: 'rss' }] },
      { label: 'Frontline', items: [{ href: '/journals', label: 'Journals', iconKey: 'journal' }] },
      {
        label: 'Administration',
        items: [{ href: '/admin/settings', label: 'Settings', iconKey: 'settings' }],
      },
    ]
    const unified = approvedNavigation(legacyGroups, () => true, new Set())
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(() => root.render(<SidebarNav groups={unified} />))
    expect(host.querySelectorAll('nav')).toHaveLength(1)
    expect(host.querySelectorAll('h2')).toHaveLength(0)
    expect(
      [...host.querySelectorAll('button[aria-expanded]')].map((button) => button.textContent),
    ).toEqual(['Dashboard', 'Diary & Tasks', 'Tenant Settings'])
    const feed = host.querySelector('a[href="/feed"]')!
    const diary = host.querySelector('a[href="/journals"]')!
    expect(feed.closest('.uvanoo-nav-children')).not.toBeNull()
    expect(diary.closest('.uvanoo-nav-children')).not.toBeNull()
    const settings = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(
      (button) => button.textContent === 'Tenant Settings',
    )!
    const panel = document.getElementById(settings.getAttribute('aria-controls')!)!
    await act(() => settings.click())
    expect(panel.hidden).toBe(false)
    expect(panel.querySelector('a[href="/admin/settings"]')).not.toBeNull()
    expect(host.textContent).not.toMatch(/Frontline|Administration|Knowledge|Assurance/)
  })
  it('exposes a real accessible disclosure without removing the parent destination', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(() => root.render(<SidebarNav groups={groups} />))
    const toggle = host.querySelector('button')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(panel.hidden).toBe(true)
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/platform/email')
    await act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    await act(() => toggle.click())
    expect(panel.hidden).toBe(true)
  })
  it('keeps nested links accessible in collapsed desktop mode', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(() => root.render(<SidebarNav groups={groups} collapsed />))
    expect(host.querySelector('a[href="/platform/sms"]')?.getAttribute('title')).toBe('SMS')
    expect(host.querySelector('[hidden]')).toBeNull()
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
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

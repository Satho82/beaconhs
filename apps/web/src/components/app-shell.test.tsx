import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/hospitality/maintenance',
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/i18n/generated', () => ({
  GeneratedValue: ({ value }: { value: ReactNode }) => value,
  useGeneratedValueTranslations: () => (value: string) => value,
  useGeneratedTranslations: () => (key: string) =>
    (({ m_045c15c009ddc0: 'All accessible properties' }) as Record<string, string>)[key] ?? key,
}))
vi.mock('./account-menu', () => ({ AccountMenu: () => <span>Jordan Ellis</span> }))
vi.mock('./tenant-switcher', () => ({
  TenantSwitcher: ({ current }: { current: { name: string } }) => (
    <span data-context="tenant">{current.name}</span>
  ),
}))
vi.mock('./role-switcher', () => ({
  RoleSwitcher: ({ current }: { current: { name: string } }) => (
    <span data-context="role">{current.name}</span>
  ),
}))
vi.mock('./platform-menu', () => ({ PlatformMenu: () => <span data-platform-menu /> }))
vi.mock('./notifications-bell', () => ({ NotificationsBell: () => <span /> }))
vi.mock('./global-search', () => ({ GlobalSearch: () => <span /> }))
vi.mock('./assistant-launcher', () => ({ AssistantLauncher: () => <span data-assistant /> }))
vi.mock('./service-worker-registrar', () => ({ ServiceWorkerRegistrar: () => null }))
vi.mock('./impersonation-banner', () => ({ ImpersonationBanner: () => <div data-impersonation /> }))
vi.mock('./app-scroll-reset', () => ({ AppScrollReset: () => null }))
vi.mock('./mobile-tab-bar', () => ({ MobileTabBar: () => null }))
vi.mock('./theme-toggle', () => ({ ThemeToggle: () => <span>Light / Terra</span> }))
vi.mock('./use-platform-nav', () => ({ useNavGroups: (groups: unknown) => groups }))
vi.mock('@/lib/hospitality/property-context-actions', () => ({
  setActiveHospitalityProperty: vi.fn(),
}))

import { AppShell } from './app-shell'
import { PageContainer } from './page-layout'
import { PageHeader } from '@beaconhs/ui'

const props = {
  ctx: { isSuperAdmin: false, tenantId: 'cycas', tenantName: 'Cycas Hospitality' },
  account: { name: 'Jordan Ellis', email: 'cluster-gm@cycas.demo.uvanoo.invalid' },
  groups: [
    {
      label: 'Operations',
      items: [{ href: '/hospitality/maintenance', label: 'Maintenance queue', iconKey: 'wrench' }],
    },
  ],
  availableTenants: [{ id: 'cycas', name: 'Cycas Hospitality', slug: 'cycas' }],
  availableRoles: [],
  activeRole: { id: null, name: 'Cluster GM' },
  propertyContext: {
    activePropertyId: null,
    properties: [
      { id: 'off', name: 'One Fifty Fenchurch' },
      { id: 'tls', name: 'The Lincoln Suites' },
    ],
  },
  unreadCount: 0,
}
function body() {
  return (
    <PageContainer>
      <PageHeader
        title="Maintenance queue"
        description="Guest and staff issues across active hotel rooms."
      />
      <a href="/hospitality/maintenance/test" className="uv-record-link mt-5">
        <strong>AC not working in Room 304</strong>
        <p>One Fifty Fenchurch · Room 304</p>
      </a>
    </PageContainer>
  )
}
describe('shared operational shell', () => {
  it('renders one property selector and one role context for all responsive sizes', () => {
    const html = renderToStaticMarkup(<AppShell {...props}>{body()}</AppShell>)
    expect(html.match(/All accessible properties/g)).toHaveLength(1)
    expect(html.match(/data-context="role"/g)).toHaveLength(1)
    expect(html.match(/data-context="tenant"/g)).toHaveLength(1)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('data-walkthrough="nav:/hospitality/maintenance"')
    expect(html).not.toContain('data-platform-menu')
    expect(html).not.toContain('data-assistant')
  })
  it('preserves explicit elevated and impersonation context', () => {
    const html = renderToStaticMarkup(
      <AppShell
        {...props}
        ctx={{ ...props.ctx, isSuperAdmin: true }}
        canUseAssistant
        impersonation={{ actorName: 'Admin', targetName: 'Jordan', expiresAtMs: 1 }}
      >
        {body()}
      </AppShell>,
    )
    expect(html).toContain('data-platform-menu')
    expect(html).toContain('data-assistant')
    expect(html).toContain('data-impersonation')
    expect(html).toContain('superAdminScopedTo')
  })
  it('does not fabricate a property control for a viewer with no available hotels', () => {
    const html = renderToStaticMarkup(
      <AppShell {...props} propertyContext={{ activePropertyId: null, properties: [] }}>
        {body()}
      </AppShell>,
    )
    expect(html).not.toContain('All accessible properties')
    expect(html).toContain('Maintenance queue')
  })
})

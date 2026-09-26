import { GeneratedValue } from '@/i18n/generated'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPlatformOperator } from '@/lib/auth'
import { PlatformShell } from '@/components/platform-shell'
import { ThemeProvider } from '@/components/theme-provider'
import { NavigationProvider } from '@/components/navigation-provider'
import { getPlatformBranding } from '@/lib/platform-branding-config'

export const dynamic = 'force-dynamic'

// Single authorization gate for the entire platform (super-admin) area. Every
// page under /platform is deployment-wide, so it must NOT be reachable by tenant
// users.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const operator = await getPlatformOperator()
  if (!operator) redirect('/admin')
  const [branding, cookieStore] = await Promise.all([getPlatformBranding(), cookies()])
  return (
    <ThemeProvider>
      <NavigationProvider>
        <PlatformShell
          operator={operator}
          branding={branding}
          defaultCollapsed={cookieStore.get('sidebar_collapsed')?.value === '1'}
        >
          <GeneratedValue value={children} />
        </PlatformShell>
      </NavigationProvider>
    </ThemeProvider>
  )
}

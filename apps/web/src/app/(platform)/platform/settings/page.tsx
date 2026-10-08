import Link from 'next/link'
import { Input, Label } from '@beaconhs/ui'
import { requirePlatformOperator } from '@/lib/auth'
import { getPlatformBranding } from '@/lib/platform-branding-config'
import { PRODUCT_NAME } from '@/lib/brand'
import { PageContainer } from '@/components/page-layout'
import { PlatformBrandingForm } from '../branding/_form'
import { savePlatformIdentity } from './_actions'

export const dynamic = 'force-dynamic'

export default async function PlatformGeneralSettingsPage() {
  await requirePlatformOperator()
  const branding = await getPlatformBranding()
  return (
    <PageContainer>
      <div className="space-y-5">
        <header>
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-blue-700">
            <Link href="/platform">Platform Admin</Link> / Global Settings / General
          </nav>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">General Settings</h1>
          <p className="mt-2 text-sm text-slate-600">Platform identity and default branding.</p>
        </header>
        <nav
          aria-label="Platform settings"
          className="flex gap-6 overflow-x-auto border-b pb-3 text-sm"
        >
          <Link
            href="/platform/settings"
            aria-current="page"
            className="font-semibold text-blue-700"
          >
            General
          </Link>
          <Link href="/platform/branding">Branding</Link>
          <Link href="/platform/email">Email Settings</Link>
          <Link href="/platform/sms">SMS Settings</Link>
        </nav>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-5">
            <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
              <h2 className="mb-5 text-lg font-semibold">Platform identity & defaults</h2>
              <PlatformBrandingForm
                key={JSON.stringify(branding)}
                action={savePlatformIdentity}
                saveLabel="Save Changes"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="productName">Platform name</Label>
                    <Input
                      id="productName"
                      name="productName"
                      required
                      maxLength={100}
                      defaultValue={branding.productName || PRODUCT_NAME}
                    />
                  </div>
                  <div>
                    <Label htmlFor="primaryColor">Default primary colour</Label>
                    <Input
                      id="primaryColor"
                      name="primaryColor"
                      pattern="#[0-9A-Fa-f]{6}"
                      defaultValue={branding.primaryColor ?? ''}
                      placeholder="Platform default"
                    />
                  </div>
                </div>
              </PlatformBrandingForm>
            </section>
            <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
              <h2 className="text-lg font-semibold">Regional & format settings</h2>
              <p className="mt-2 text-sm text-slate-600">
                Regional settings are managed for each tenant. Platform-wide regional defaults are
                not available.
              </p>
              <Link href="/platform/tenants" className="mt-3 inline-block text-sm text-blue-700">
                View tenants
              </Link>
            </section>
          </div>
          <aside className="space-y-5">
            <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
              <h2 className="font-semibold">Quick Actions</h2>
              <div className="mt-4 grid gap-3 text-sm text-blue-700">
                <Link href="/platform/tenants/new">Add Tenant</Link>
                <Link href="/platform/users">Platform Users</Link>
                <Link href="/platform/branding">Platform Branding</Link>
              </div>
            </section>
            <section className="rounded-xl border bg-blue-50 p-5 text-sm text-slate-700">
              <h2 className="font-semibold">About these settings</h2>
              <p className="mt-2">
                The platform identity is shared across tenants. Tenant branding overrides remain
                separate. Saving here preserves logos, email settings and analytics configuration.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </PageContainer>
  )
}

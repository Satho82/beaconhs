import { getTranslations } from 'next-intl/server'
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
  const tBatch = await getTranslations('Generated')

  await requirePlatformOperator()
  const branding = await getPlatformBranding()
  return (
    <PageContainer>
      <div className="space-y-5">
        <header>
          <nav aria-label={tBatch('m_1a9098c58fe1c9')} className="mb-3 text-sm text-blue-700">
            <Link href="/platform">{tBatch('m_0e18ff85237499')}</Link> {tBatch('m_132be743f60ac9')}
          </nav>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            {tBatch('m_0c24bd87bb3b38')}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{tBatch('m_142cf531e73c04')}</p>
        </header>
        <nav
          aria-label={tBatch('m_0e5e43ee4ed360')}
          className="flex gap-6 overflow-x-auto border-b pb-3 text-sm"
        >
          <Link
            href="/platform/settings"
            aria-current="page"
            className="font-semibold text-blue-700"
          >
            {tBatch('m_1086584d9aca6a')}
          </Link>
          <Link href="/platform/branding">{tBatch('m_009d942e2e5b0f')}</Link>
          <Link href="/platform/email">{tBatch('m_1ccd6e8140accd')}</Link>
          <Link href="/platform/sms">{tBatch('m_0948287f956c13')}</Link>
        </nav>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-5">
            <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
              <h2 className="mb-5 text-lg font-semibold">{tBatch('m_1b687304f238d1')}</h2>
              <PlatformBrandingForm
                key={JSON.stringify(branding)}
                action={savePlatformIdentity}
                saveLabel="Save Changes"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="productName">{tBatch('m_0efe2a87082a42')}</Label>
                    <Input
                      id="productName"
                      name="productName"
                      required
                      maxLength={100}
                      defaultValue={branding.productName || PRODUCT_NAME}
                    />
                  </div>
                  <div>
                    <Label htmlFor="primaryColor">{tBatch('m_05432d06ae9649')}</Label>
                    <Input
                      id="primaryColor"
                      name="primaryColor"
                      pattern="#[0-9A-Fa-f]{6}"
                      defaultValue={branding.primaryColor ?? ''}
                      placeholder={tBatch('m_123c4b29a38422')}
                    />
                  </div>
                </div>
              </PlatformBrandingForm>
            </section>
            <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
              <h2 className="text-lg font-semibold">{tBatch('m_1008be5e154cf3')}</h2>
              <p className="mt-2 text-sm text-slate-600">{tBatch('m_0d563166bdbbb6')}</p>
              <Link href="/platform/tenants" className="mt-3 inline-block text-sm text-blue-700">
                {tBatch('m_1f40a9df84070e')}
              </Link>
            </section>
          </div>
          <aside className="space-y-5">
            <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
              <h2 className="font-semibold">{tBatch('m_004dbe2a370b63')}</h2>
              <div className="mt-4 grid gap-3 text-sm text-blue-700">
                <Link href="/platform/tenants/new">{tBatch('m_1a0eb0508eabe4')}</Link>
                <Link href="/platform/users">{tBatch('m_07beae261675f3')}</Link>
                <Link href="/platform/branding">{tBatch('m_197a187dc6afc5')}</Link>
              </div>
            </section>
            <section className="rounded-xl border bg-blue-50 p-5 text-sm text-slate-700">
              <h2 className="font-semibold">{tBatch('m_008546ba4bb805')}</h2>
              <p className="mt-2">{tBatch('m_19f6ee9a0836be')}</p>
            </section>
          </aside>
        </div>
      </div>
    </PageContainer>
  )
}

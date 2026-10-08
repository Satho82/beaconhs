import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { Button, DetailHeader, Input, Label, Select } from '@beaconhs/ui'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { LOCALE_OPTIONS } from '@beaconhs/i18n'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { PageContainer } from '@/components/page-layout'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import { saveTenantPlatformSettings } from '../_actions'

export const dynamic = 'force-dynamic'
export default async function PlatformTenantSettingsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const tGenerated = await getGeneratedTranslations()
  await requirePlatformOperator()
  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound()
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1),
  )
  if (!tenant) notFound()
  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl space-y-5">
        <DetailHeader
          back={{
            href: `/platform/tenants/${tenantId}`,
            label: tGenerated('m_137b646c00feff'),
          }}
          title={tGenerated('m_17de16677ef69f', { value0: tenant.name })}
          subtitle={tGenerated('m_13d929777accaa')}
        />
        <form
          action={saveTenantPlatformSettings}
          className="space-y-4 rounded-lg border bg-white p-5 dark:bg-slate-900"
        >
          <input type="hidden" name="tenantId" value={tenantId} />
          <Label>
            {tGenerated('m_1de0752c52bdd4')}
            <Input name="region" defaultValue={tenant.region} required />
          </Label>
          <Label>
            {tGenerated('m_1a07c774d6ca11')}
            <Select name="defaultLanguage" defaultValue={tenant.defaultLanguage}>
              {LOCALE_OPTIONS.map((locale) => (
                <option key={locale.value} value={locale.value}>
                  {locale.label}
                </option>
              ))}
            </Select>
          </Label>
          <Button type="submit">{tGenerated('m_0bdcc953ae29cd')}</Button>
        </form>
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">{tGenerated('m_137b646c00feff')}</Button>
        </Link>
      </div>
    </PageContainer>
  )
}

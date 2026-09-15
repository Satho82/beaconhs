import { assertCan } from '@beaconhs/tenant'
import { PageHeader } from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { PropertyForm } from './property-form'

export default async function NewPropertyPage() {
  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  assertCan(ctx, 'hospitality.manage')
  const t = await getGeneratedValueTranslations()
  return (
    <PageContainer>
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader
          title={t('Add property')}
          description={t('Enter the property name, code, and a valid IANA timezone.')}
          back={{ href: '/hospitality/properties', label: t('All properties') }}
        />
        <PropertyForm timezone={ctx.timezone} />
      </div>
    </PageContainer>
  )
}

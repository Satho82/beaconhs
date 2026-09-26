import { getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button, DetailHeader, Input, Label, Select } from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { requirePlatformOperator } from '@/lib/auth'
import { MODULE_CATALOGUE } from '@/lib/module-entitlements/catalogue'
import { listTenantModuleEntitlements } from '@/lib/module-entitlements/platform'
import { saveTenantModuleEntitlementAction } from './_actions'

export const dynamic = 'force-dynamic'

export default async function TenantEntitlementsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const translateHospitality = await getGeneratedTranslations()

  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound()

  const operator = await requirePlatformOperator()

  const { tenant, rows } = await listTenantModuleEntitlements(operator, tenantId)
  const rowsByKey = new Map(rows.map((row) => [row.moduleKey, row]))

  return (
    <PageContainer>
      <div className="mx-auto max-w-4xl space-y-5">
        <DetailHeader
          back={{ href: '/platform/tenants', label: 'Back to tenants' }}
          title={translateHospitality('m_0a373b20ea3c4e', { value0: tenant.name })}
          subtitle={translateHospitality('m_1d01fd02fc5d0c')}
        />

        <div className="grid gap-4">
          {MODULE_CATALOGUE.map((module) => {
            const row = rowsByKey.get(module.key)
            return (
              <form
                key={module.key}
                action={saveTenantModuleEntitlementAction}
                className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4 sm:items-end"
              >
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="moduleKey" value={module.key} />
                <div className="sm:col-span-2">
                  <h2 className="font-medium">{module.name}</h2>
                  <p className="text-muted-foreground text-sm">{module.description}</p>
                </div>
                <Label>
                  {translateHospitality('m_18f842f77b3c8b')}
                  <Select name="state" defaultValue={row?.state ?? 'disabled'}>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </Select>
                </Label>
                <Button type="submit">{translateHospitality('m_19e6bff894c3c7')}</Button>
                <Label>
                  {translateHospitality('m_1b19f01f52ddce')}
                  <Input
                    type="date"
                    name="effectiveFrom"
                    defaultValue={row?.effectiveFrom?.toISOString().slice(0, 10) ?? ''}
                  />
                </Label>
                <Label>
                  {translateHospitality('m_05a10d13921833')}
                  <Input
                    type="date"
                    name="effectiveUntil"
                    defaultValue={row?.effectiveUntil?.toISOString().slice(0, 10) ?? ''}
                  />
                </Label>
              </form>
            )
          })}
        </div>
        <Link href="/platform/tenants">
          <Button variant="outline">{translateHospitality('m_00609f822e0571')}</Button>
        </Link>
      </div>
    </PageContainer>
  )
}

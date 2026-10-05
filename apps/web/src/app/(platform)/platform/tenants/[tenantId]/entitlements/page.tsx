import { getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge, Button, DetailHeader, Input, Label, Select } from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { requirePlatformOperator } from '@/lib/auth'
import { isEntitlementEffective } from '@/lib/module-entitlements/policy'
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

  const now = new Date()
  const diary = rowsByKey.get('hospitality.diary')
  const diaryEffective = Boolean(diary && isEntitlementEffective(diary, now))

  return (
    <PageContainer>
      <div className="mx-auto max-w-4xl space-y-5">
        <DetailHeader
          back={{ href: `/platform/tenants/${tenantId}`, label: 'Back to tenant' }}
          title={translateHospitality('m_0a373b20ea3c4e', { value0: tenant.name })}
          subtitle={translateHospitality('m_1d01fd02fc5d0c')}
        />

        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Module configuration does not replace role or property permissions. Compliance enforcement
          coverage remains incomplete; an enabled setting is not a claim of complete enforcement.
        </p>
        <div className="grid gap-4">
          {MODULE_CATALOGUE.map((module) => {
            const row = rowsByKey.get(module.key)
            const effective =
              Boolean(row && isEntitlementEffective(row, now)) &&
              (module.key !== 'hospitality.manager-signoff' || diaryEffective)
            return (
              <form
                key={module.key}
                action={saveTenantModuleEntitlementAction}
                className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-4 sm:items-end dark:bg-slate-900"
              >
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="moduleKey" value={module.key} />
                <div className="sm:col-span-2">
                  <h2 className="font-medium">{module.name}</h2>
                  <p className="text-muted-foreground text-sm">{module.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={effective ? 'success' : 'secondary'}>
                      Effective now: {effective ? 'Yes' : 'No'}
                    </Badge>
                    <Badge variant="secondary">Configured: {row?.state ?? 'disabled'}</Badge>
                  </div>
                  {module.key === 'hospitality.manager-signoff' && (
                    <p className="mt-2 text-sm text-slate-600">
                      Requires Diary to be effective. Diary is currently{' '}
                      {diaryEffective ? 'effective' : 'not effective'}.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    Last changed:{' '}
                    {row?.updatedAt?.toISOString().replace('T', ' ').slice(0, 16) ??
                      'Not configured'}
                    {row ? ' UTC' : ''} · Changed by:{' '}
                    {row?.changedByName ??
                      (row?.changedByUserId ? 'Recorded identity unavailable' : 'Not recorded')}
                  </p>
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
                  Effective from (UTC)
                  <Input
                    type="date"
                    name="effectiveFrom"
                    defaultValue={row?.effectiveFrom?.toISOString().slice(0, 10) ?? ''}
                  />
                </Label>
                <Label>
                  Effective until (exclusive, UTC)
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

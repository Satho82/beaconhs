import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { assertCan, can } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { loadEnabledModuleKeys } from '@/lib/module-entitlements/server'
import { MODULE_CATALOGUE } from '@/lib/module-entitlements/catalogue'
import { PageContainer } from '@/components/page-layout'
import { SettingsNavigation } from '../settings-form'

export const dynamic = 'force-dynamic'

export default async function TenantModulesPage() {
  const tBatch = await getTranslations('Generated')

  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  const enabled = await loadEnabledModuleKeys(ctx)
  return (
    <PageContainer>
      <div className="space-y-6">
        <header>
          <p className="text-sm text-blue-700">{tBatch('m_152a0c53b77f75')}</p>
          <h1 className="text-3xl font-bold">{tBatch('m_03abc46dafbce6')}</h1>
          <p className="mt-2 text-sm text-slate-600">{tBatch('m_1ee912f98d5609')}</p>
        </header>
        <SettingsNavigation
          canManageIntegrations={can(ctx, 'admin.integrations.manage')}
          navigationLabel="Tenant Settings"
          activeSection="modules"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {MODULE_CATALOGUE.map((module) => (
            <section key={module.key} className="rounded-xl border bg-white p-5 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{module.name}</h2>
                <span
                  className={
                    enabled.has(module.key) ? 'text-sm text-emerald-700' : 'text-sm text-slate-500'
                  }
                >
                  {enabled.has(module.key)
                    ? tBatch('m_0dd399c5304eb6')
                    : tBatch('m_0d9b18bddfa4cb')}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{module.description}</p>
            </section>
          ))}
        </div>
        <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
          <h2 className="font-semibold">{tBatch('m_0f3f83568abfad')}</h2>
          <p className="mt-2 text-sm text-slate-600">{tBatch('m_17014316ea2607')}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-blue-700">
            {ctx.isSuperAdmin && (
              <Link href={`/platform/tenants/${ctx.tenantId}/entitlements`}>
                {tBatch('m_1995f37c2926db')}
              </Link>
            )}
            {can(ctx, 'admin.nav.manage') && (
              <Link href="/admin/navigation">{tBatch('m_05ec38bf73df6f')}</Link>
            )}
            {can(ctx, 'admin.roles.manage') && (
              <Link href="/admin/roles">{tBatch('m_02e76a1d62e947')}</Link>
            )}
            {can(ctx, 'admin.users.manage') && (
              <Link href="/admin/users">{tBatch('m_1b257dc3ec69bd')}</Link>
            )}
          </div>
        </section>
      </div>
    </PageContainer>
  )
}

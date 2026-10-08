import Link from 'next/link'
import { assertCan, can } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { loadEnabledModuleKeys } from '@/lib/module-entitlements/server'
import { MODULE_CATALOGUE } from '@/lib/module-entitlements/catalogue'
import { PageContainer } from '@/components/page-layout'
import { SettingsNavigation } from '../settings-form'

export const dynamic = 'force-dynamic'

export default async function TenantModulesPage() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  const enabled = await loadEnabledModuleKeys(ctx)
  return (
    <PageContainer>
      <div className="space-y-6">
        <header>
          <p className="text-sm text-blue-700">Tenant Settings</p>
          <h1 className="text-3xl font-bold">Modules</h1>
          <p className="mt-2 text-sm text-slate-600">
            Current module access for this tenant. Platform administrators manage entitlements.
          </p>
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
                  {enabled.has(module.key) ? 'Enabled' : 'Not enabled'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{module.description}</p>
            </section>
          ))}
        </div>
        <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
          <h2 className="font-semibold">Access and navigation</h2>
          <p className="mt-2 text-sm text-slate-600">
            An enabled module still requires the appropriate role and property access. Hiding a menu
            item does not change access.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-blue-700">
            {ctx.isSuperAdmin && (
              <Link href={`/platform/tenants/${ctx.tenantId}/entitlements`}>
                Manage tenant entitlements
              </Link>
            )}
            {can(ctx, 'admin.nav.manage') && (
              <Link href="/admin/navigation">Navigation preferences</Link>
            )}
            {can(ctx, 'admin.roles.manage') && <Link href="/admin/roles">Roles & permissions</Link>}
            {can(ctx, 'admin.users.manage') && (
              <Link href="/admin/users">Users & property assignments</Link>
            )}
          </div>
        </section>
      </div>
    </PageContainer>
  )
}

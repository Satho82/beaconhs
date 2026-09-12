import Link from 'next/link'
import { Button, DetailHeader, EmptyState, Input, Label, Select } from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { MODULE_CATALOGUE } from '@/lib/module-entitlements/catalogue'
import { listTenantModuleEntitlements } from '@/lib/module-entitlements/platform'
import { saveTenantModuleEntitlementAction } from './_actions'

export const dynamic = 'force-dynamic'

export default async function TenantEntitlementsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const ctx = await requireRequestContext()
  const { tenantId } = await params
  const { tenant, rows } = await listTenantModuleEntitlements(ctx, tenantId)
  const rowsByKey = new Map(rows.map((row) => [row.moduleKey, row]))

  return (
    <PageContainer>
      <div className="mx-auto max-w-4xl space-y-5">
        <DetailHeader
          back={{ href: '/platform/tenants', label: 'Back to tenants' }}
          title={`${tenant.name} modules`}
          subtitle="Platform-controlled tenant module entitlements. Tenant navigation is updated only after a server-enforced entitlement is effective."
        />
        {MODULE_CATALOGUE.length === 0 ? <EmptyState title="No hospitality modules are registered." /> : (
          <div className="grid gap-4">
            {MODULE_CATALOGUE.map((module) => {
              const row = rowsByKey.get(module.key)
              return <form key={module.key} action={saveTenantModuleEntitlementAction} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4 sm:items-end">
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="moduleKey" value={module.key} />
                <div className="sm:col-span-2"><h2 className="font-medium">{module.name}</h2><p className="text-sm text-muted-foreground">{module.description}</p></div>
                <Label>State<Select name="state" defaultValue={row?.state ?? 'disabled'}><option value="enabled">Enabled</option><option value="disabled">Disabled</option></Select></Label>
                <Button type="submit">Save</Button>
                <Label>Effective from<Input type="date" name="effectiveFrom" defaultValue={row?.effectiveFrom?.toISOString().slice(0, 10) ?? ''} /></Label>
                <Label>Effective until<Input type="date" name="effectiveUntil" defaultValue={row?.effectiveUntil?.toISOString().slice(0, 10) ?? ''} /></Label>
              </form>
            })}
          </div>
        )}
        <Link href="/platform/tenants"><Button variant="outline">Done</Button></Link>
      </div>
    </PageContainer>
  )
}

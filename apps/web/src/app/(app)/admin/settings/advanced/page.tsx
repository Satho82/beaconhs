import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { assertCan, can, resolveRegulatoryTerminology } from '@beaconhs/tenant'
import { Input, Label } from '@beaconhs/ui'
import { requireRequestContext } from '@/lib/auth'
import { PageContainer } from '@/components/page-layout'
import { SettingsForm } from '../settings-form'
import { saveAdvancedSettings } from './_actions'

export const dynamic = 'force-dynamic'

export default async function AdvancedSettingsPage() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx
      .select({ name: tenants.name, settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1),
  )
  if (!tenant) notFound()
  const regulatory = resolveRegulatoryTerminology(tenant.settings)
  const fields = [
    ['authorityName', 'Authority name'],
    ['authorityAbbreviation', 'Authority abbreviation'],
    ['legislationName', 'Legislation name'],
    ['legislationAbbreviation', 'Legislation abbreviation'],
    ['otherApplicableLegislation', 'Other applicable legislation'],
  ] as const
  return (
    <PageContainer>
      <div className="space-y-5">
        <header>
          <p className="text-sm text-blue-700">Tenant Settings / Advanced</p>
          <h1 className="text-3xl font-bold">Advanced</h1>
          <p className="mt-2 text-sm text-slate-600">{tenant.name}</p>
        </header>
        <SettingsForm
          key={JSON.stringify(regulatory)}
          action={saveAdvancedSettings}
          canManageIntegrations={can(ctx, 'admin.integrations.manage')}
          activeSection="advanced"
          navigationLabel="Tenant Settings"
          saveLabel="Save Changes"
          discardLabel="Discard"
          sidebar={
            <section className="rounded-xl border bg-blue-50 p-5 text-sm">
              <h2 className="font-semibold">About these settings</h2>
              <p className="mt-2">
                Regulatory terminology is used throughout this tenant. These settings do not change
                module entitlements, roles or property assignments.
              </p>
            </section>
          }
        >
          <section className="space-y-4 rounded-xl border bg-white p-5 dark:bg-slate-900">
            <h2 className="text-lg font-semibold">Regulatory terminology</h2>
            {fields.map(([name, label]) => (
              <div key={name}>
                <Label htmlFor={name}>{label}</Label>
                <Input id={name} name={name} defaultValue={regulatory[name]} maxLength={2000} />
              </div>
            ))}
          </section>
        </SettingsForm>
      </div>
    </PageContainer>
  )
}

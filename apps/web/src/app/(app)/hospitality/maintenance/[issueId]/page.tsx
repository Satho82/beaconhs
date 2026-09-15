import { getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { and, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { Button, Input, Label, PageHeader, Select } from '@beaconhs/ui'
import { maintenanceIssues, tenantUsers, users } from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan, can } from '@beaconhs/tenant'
import { updateMaintenanceIssueAction } from '../../properties/actions'
export default async function IssuePage({ params }: { params: Promise<{ issueId: string }> }) {
  const translateHospitality = await getGeneratedTranslations()

  const { issueId } = await params
  if (!isUuid(issueId)) notFound()
  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.maintenance')
  assertCan(ctx, 'maintenance.read')
  const d = await ctx.db(async (tx) => {
    const [r] = await tx
      .select()
      .from(maintenanceIssues)
      .where(and(eq(maintenanceIssues.tenantId, ctx.tenantId), eq(maintenanceIssues.id, issueId)))
      .limit(1)
    const members = await tx
      .select({ id: tenantUsers.id, name: tenantUsers.displayName, email: users.email })
      .from(tenantUsers)
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(eq(tenantUsers.tenantId, ctx.tenantId))
    return { r, members }
  })
  if (!d.r) notFound()
  const r = d.r
  return (
    <main className="mx-auto max-w-4xl p-4">
      <PageHeader title={r.summary} description={`${r.reference} · ${r.priority} · ${r.status}`} />
      <p>{r.description}</p>
      {can(ctx, 'maintenance.update') && (
        <form action={updateMaintenanceIssueAction} className="my-4 grid gap-2 rounded border p-3">
          <input type="hidden" name="issueId" value={r.id} />
          <Label>
            {translateHospitality('m_00f0e2904a371c')}
            <Input name="priority" defaultValue={r.priority} />
          </Label>
          <Label>
            {translateHospitality('m_0b9da892d6faf0')}
            <Input name="status" defaultValue={r.status} />
          </Label>
          <Label>
            {translateHospitality('m_03a84b76ec2cd1')}
            <Select name="assignee" defaultValue={r.assignedToTenantUserId ?? ''}>
              <option value="">Unassigned</option>
              {d.members.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name || m.email}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            {translateHospitality('m_0686fdc3ff30ad')}
            <Input name="resolutionNotes" defaultValue={r.resolutionNotes ?? ''} />
          </Label>
          <Button type="submit">{translateHospitality('m_0727c17a09623c')}</Button>
        </form>
      )}
      <p>{r.completedAt?.toISOString()}</p>
    </main>
  )
}

'use server'
import { eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { assertCan, resolveRegulatoryTerminology } from '@beaconhs/tenant'
import { revalidatePath } from 'next/cache'
import { requireRequestContext } from '@/lib/auth'
import { recordAuditInTransaction } from '@/lib/audit'

export async function saveAdvancedSettings(data: FormData) {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  const fields = [
    'authorityName',
    'authorityAbbreviation',
    'legislationName',
    'legislationAbbreviation',
    'otherApplicableLegislation',
  ] as const
  const values = Object.fromEntries(
    fields.map((field) => {
      const value = String(data.get(field) ?? '').trim()
      if (value.length > 2000) throw new Error('Regulatory text is too long.')
      return [field, value]
    }),
  )
  const regulatoryTerminology = resolveRegulatoryTerminology({ regulatoryTerminology: values })
  await withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1)
    if (!tenant) throw new Error('Tenant not found.')
    await tx
      .update(tenants)
      .set({ settings: { ...tenant.settings, regulatoryTerminology } })
      .where(eq(tenants.id, ctx.tenantId))
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'tenant',
      entityId: ctx.tenantId,
      action: 'update',
      summary: 'Tenant regulatory terminology updated',
      before: resolveRegulatoryTerminology(tenant.settings),
      after: regulatoryTerminology,
    })
  })
  revalidatePath('/', 'layout')
}

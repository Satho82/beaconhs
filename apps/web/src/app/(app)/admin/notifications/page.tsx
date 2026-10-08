import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import { notFound, redirect } from 'next/navigation'
import { and, asc, eq, isNull } from 'drizzle-orm'
import {
  personGroups,
  tenants,
  roles as rolesTable,
  tenantNotificationPolicy,
  tenantNotificationSettings,
  tenantUsers,
  users,
} from '@beaconhs/db/schema'
import { resolveEffectiveTransport } from '@beaconhs/emails'
import { resolveEffectiveSmsTransport } from '@beaconhs/sms'
import { can } from '@beaconhs/tenant'
import { DetailHeader } from '@beaconhs/ui'
import { requireRequestContext } from '@/lib/auth'
import { AdminLoadFailure } from '@/components/admin-load-failure'
import { getPlatformEmailRaw, getTenantEmailRaw } from '@/lib/email-config'
import { getPlatformSmsRaw, getTenantSmsRaw } from '@/lib/sms-config'
import { PageContainer } from '@/components/page-layout'
import { NotificationsSubNav } from '@/components/notifications-sub-nav'
import { NOTIFICATION_CATEGORIES } from './_catalog'
import { NotificationSettingsForm, type ChannelAvailability } from './_form'
import { SettingsNavigation } from '../settings/settings-form'

export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  const tGenerated = await getGeneratedTranslations()
  return { title: tGenerated('m_18d4f38ded7c87') }
}

export default async function NotificationSettingsPage() {
  const tBoard = await getGeneratedValueTranslations()

  const tGenerated = await getGeneratedTranslations()
  const ctx = await requireRequestContext()
  if (!ctx.isSuperAdmin && !can(ctx, 'admin.settings.manage')) redirect('/admin')
  const [tenant] = await ctx.db((tx) =>
    tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1),
  )
  if (!tenant) notFound()

  // Authentication, authorization and missing-tenant handling remain outside the
  // configuration catch. A genuine load failure must never enable default edits.
  const configuration = await loadConfiguration(ctx).catch(() => <AdminLoadFailure />)

  return (
    <PageContainer>
      <p className="mb-3 text-sm text-slate-600">
        {tenant.name} {tBoard('· Changes apply to this tenant.')}
      </p>
      <SettingsNavigation
        canManageIntegrations={can(ctx, 'admin.integrations.manage')}
        navigationLabel="Tenant settings"
        activeSection="notifications"
      />
      <div className="space-y-4">
        <DetailHeader
          title={tGenerated('m_18d4f38ded7c87')}
          subtitle={tGenerated('m_133c7f1d3c39a0')}
        />
        <NotificationsSubNav active="rules" />
        {configuration}
      </div>
    </PageContainer>
  )
}

async function loadConfiguration(ctx: Awaited<ReturnType<typeof requireRequestContext>>) {
  const { roleRows, memberRows } = await ctx.db(async (tx) => {
    const roleRows = await tx
      .select({ key: rolesTable.key, name: rolesTable.name })
      .from(rolesTable)
      .where(eq(rolesTable.tenantId, ctx.tenantId))
      .orderBy(asc(rolesTable.name))
    const memberRows = await tx
      .select({
        userId: tenantUsers.userId,
        displayName: tenantUsers.displayName,
        email: users.email,
      })
      .from(tenantUsers)
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(and(eq(tenantUsers.tenantId, ctx.tenantId), eq(tenantUsers.status, 'active')))
      .orderBy(asc(tenantUsers.displayName))
    return { roleRows, memberRows }
  })

  const settingRows = await ctx.db((tx) =>
    tx
      .select()
      .from(tenantNotificationSettings)
      .where(eq(tenantNotificationSettings.tenantId, ctx.tenantId)),
  )
  const [policyRow] = await ctx.db((tx) =>
    tx
      .select()
      .from(tenantNotificationPolicy)
      .where(eq(tenantNotificationPolicy.tenantId, ctx.tenantId))
      .limit(1),
  )

  const initial: Record<
    string,
    {
      enabled: boolean
      roleKeys: string[]
      userIds: string[]
      groupIds: string[]
      channels: string[]
      escalation: { afterDays: number; roleKeys: string[] }[]
    }
  > = {}
  for (const r of settingRows) {
    initial[r.category] = {
      enabled: r.enabled,
      roleKeys: r.roleKeys ?? [],
      userIds: r.userIds ?? [],
      groupIds: r.groupIds ?? [],
      channels: r.channels ?? [],
      escalation: r.escalation ?? [],
    }
  }

  const groupRows = await ctx.db((tx) =>
    tx
      .select({ id: personGroups.id, name: personGroups.name })
      .from(personGroups)
      .where(and(eq(personGroups.tenantId, ctx.tenantId), isNull(personGroups.deletedAt)))
      .orderBy(asc(personGroups.name)),
  )
  const groups = groupRows.map((g) => ({ value: g.id, label: g.name }))

  const policy = {
    digestMode: (policyRow?.digestMode ?? 'off') as 'off' | 'daily' | 'weekly',
    digestHourUtc: policyRow?.digestHourUtc ?? 7,
    quietHours: policyRow?.quietHours ?? null,
    scanEnabled: policyRow?.scanEnabled ?? true,
    scanCron: policyRow?.scanCron ?? '0 6 * * *',
    scanTimezone: policyRow?.scanTimezone ?? 'UTC',
  }

  const members = memberRows
    .map((m) => ({ value: m.userId ?? '', label: m.displayName ?? m.email }))
    .filter((m) => m.value)

  // A failed lookup is not evidence that a transport is unconfigured.
  const [platformEmail, tenantEmail, platformSms, tenantSms] = await Promise.all([
    getPlatformEmailRaw(),
    getTenantEmailRaw(ctx),
    getPlatformSmsRaw(),
    getTenantSmsRaw(ctx),
  ])
  const emailDelivery = resolveEffectiveTransport(platformEmail, tenantEmail, {
    tenantScoped: true,
  })
  const smsDelivery = resolveEffectiveSmsTransport(platformSms, tenantSms, { tenantScoped: true })
  const availability = (kind: string): ChannelAvailability =>
    kind === 'transport' ? 'ready' : kind === 'suppressed' ? 'disabled' : 'unconfigured'
  const emailAvailability = availability(emailDelivery.kind)
  const smsAvailability = availability(smsDelivery.kind)

  return (
    <NotificationSettingsForm
      categories={NOTIFICATION_CATEGORIES}
      roles={roleRows}
      members={members}
      groups={groups}
      initial={initial}
      policy={policy}
      emailAvailability={emailAvailability}
      smsAvailability={smsAvailability}
    />
  )
}

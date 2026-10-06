import { getGeneratedValueTranslations, getGeneratedTranslations } from '@/i18n/generated.server'
import { GeneratedValue } from '@/i18n/generated'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { and, count, eq, isNull } from 'drizzle-orm'
import {
  Building2,
  CircleHelp,
  FileText,
  Info,
  LayoutGrid,
  Settings,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Textarea,
} from '@beaconhs/ui'
import { db, withSuperAdmin } from '@beaconhs/db'
import {
  hospitalityProperties,
  hospitalityRooms,
  tenantModuleEntitlements,
  tenants,
  tenantUsers,
} from '@beaconhs/db/schema'
import { LOCALE_OPTIONS } from '@beaconhs/i18n'
import { can, resolveRegulatoryTerminology } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import {
  DATE_FORMATS,
  DATE_FORMAT_OPTIONS,
  LEGACY_DATE_FORMATS,
  NUMBER_FORMATS,
} from '@/lib/tenant-operational-defaults'
import { PageContainer } from '@/components/page-layout'
import { saveSettings } from './_actions'
import { SettingsForm } from './settings-form'

export async function generateMetadata() {
  const tGenerated = await getGeneratedTranslations()
  return { title: tGenerated('m_03121a3f188759') }
}
export const dynamic = 'force-dynamic'

const CURRENCY_OPTIONS = [
  ['GBP', 'GBP — £'],
  ['EUR', 'EUR — €'],
  ['USD', 'USD — $'],
  ['AED', 'AED — د.إ'],
] as const
const TIMEZONE_OPTIONS = [
  'Europe/London',
  'Europe/Paris',
  'Europe/Rome',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
] as const

// Tenant settings is admin configuration. saveSettings bypasses RLS to write
// the global tenants row, so it must self-gate (a POST endpoint isn't protected
// by the page render gate). `can` returns true for super-admins.
async function requireSettingsAdmin() {
  const ctx = await requireRequestContext()
  if (!can(ctx, 'admin.settings.manage')) redirect('/admin')
  return ctx
}

type SettingsSection = 'general'

export default async function AdminSettingsPage() {
  return <SettingsPage activeSection="general" />
}

async function SettingsPage({ activeSection }: { activeSection: SettingsSection }) {
  const tBoard = await getGeneratedValueTranslations()

  const tGeneratedValue = await getGeneratedValueTranslations()
  const tGenerated = await getGeneratedTranslations()
  const ctx = await requireSettingsAdmin()
  const [t, languages, account] = await Promise.all([
    getTranslations('TenantSettings'),
    getTranslations('Languages'),
    getTranslations('Account'),
  ])
  const { tenant, overview } = await withSuperAdmin(db, async (tx) => {
    const [tenant, properties, rooms, users, modules] = await Promise.all([
      tx.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1),
      tx
        .select({ total: count() })
        .from(hospitalityProperties)
        .where(
          and(
            eq(hospitalityProperties.tenantId, ctx.tenantId),
            isNull(hospitalityProperties.deletedAt),
          ),
        ),
      tx
        .select({ total: count() })
        .from(hospitalityRooms)
        .where(
          and(eq(hospitalityRooms.tenantId, ctx.tenantId), isNull(hospitalityRooms.deletedAt)),
        ),
      tx.select({ total: count() }).from(tenantUsers).where(eq(tenantUsers.tenantId, ctx.tenantId)),
      tx
        .select({ total: count() })
        .from(tenantModuleEntitlements)
        .where(eq(tenantModuleEntitlements.tenantId, ctx.tenantId)),
    ])
    return {
      tenant: tenant[0],
      overview: {
        properties: properties[0]?.total ?? 0,
        rooms: rooms[0]?.total ?? 0,
        users: users[0]?.total ?? 0,
        modules: modules[0]?.total ?? 0,
      },
    }
  })
  if (!tenant) return null

  const enabled = new Set(tenant.enabledLanguages)
  const regulatory = resolveRegulatoryTerminology(tenant.settings)

  return (
    <PageContainer className="max-w-[100rem] py-5 sm:py-6">
      <div className="space-y-4">
        <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="mb-3 flex items-center gap-2 text-sm text-teal-700">
            <Link href="/dashboard">{t('home')}</Link>
            <span>›</span>
            <span>{t('title')}</span>
            <span>›</span>
            <span className="font-medium text-slate-900">{t(activeSection)}</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-teal-50 p-3 text-teal-700">
              <Settings size={34} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {t('title')}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {tenant.name} {tBoard('· Changes apply to this tenant.')}
              </p>
            </div>
          </div>
        </div>

        <SettingsForm
          action={saveSettings}
          saveLabel={account('saveChanges')}
          discardLabel={tGenerated('m_056c8c15d77140')}
          navigationLabel={tGeneratedValue(t('title'))}
          activeSection={activeSection}
          sidebar={<SettingsSidebar tenant={tenant} overview={overview} />}
        >
          <Card
            id="operational-defaults"
            className="scroll-mt-6 border-slate-200 shadow-none dark:border-slate-800"
          >
            <CardHeader>
              <CardTitle>
                <GeneratedValue value={t('operationalDefaults')} />
              </CardTitle>
              <CardDescription>
                <GeneratedValue value={t('operationalDefaultsDescription')} />
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label={tGeneratedValue(t('operationalLocale'))}>
                <Select name="operationalLocale" defaultValue={tenant.operationalLocale} required>
                  {LOCALE_OPTIONS.map((locale) => (
                    <option key={locale.value} value={locale.value}>
                      {locale.nativeLabel}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tGeneratedValue(t('operationalTimezone'))}>
                <Select
                  name="operationalTimezone"
                  defaultValue={tenant.operationalTimezone}
                  required
                >
                  {TIMEZONE_OPTIONS.map((timezone) => (
                    <option key={timezone} value={timezone}>
                      {timezone}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tGeneratedValue(t('dateFormat'))}>
                <Select
                  name="dateFormat"
                  defaultValue={
                    (DATE_FORMATS as readonly string[]).includes(tenant.dateFormat)
                      ? tenant.dateFormat
                      : 'DD/MM/YYYY'
                  }
                >
                  {DATE_FORMAT_OPTIONS.map(([format, label]) => (
                    <option key={format} value={format}>
                      {tGeneratedValue(t(label))}
                    </option>
                  ))}
                </Select>
                {(LEGACY_DATE_FORMATS as readonly string[]).includes(tenant.dateFormat) ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('dateFormatLegacyNotice')}
                  </p>
                ) : null}
              </Field>
              <Field label={tGeneratedValue(t('numberFormat'))}>
                <Select name="numberFormat" defaultValue={tenant.numberFormat}>
                  {NUMBER_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {tGeneratedValue(t(`numberFormat_${format}`))}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tGeneratedValue(t('defaultCurrencyCode'))}>
                <Select
                  name="defaultCurrencyCode"
                  defaultValue={tenant.defaultCurrencyCode}
                  required
                >
                  {CURRENCY_OPTIONS.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card
            id="identity"
            className="scroll-mt-6 border-slate-200 shadow-none dark:border-slate-800"
          >
            <CardHeader>
              <CardTitle>
                <GeneratedValue value={t('identity')} />
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={tGeneratedValue(t('name'))}>
                <Input name="name" defaultValue={tenant.name} />
              </Field>
              <Field label={tGeneratedValue(t('slug'))}>
                <Input name="slug" defaultValue={tenant.slug} className="font-mono" />
              </Field>
            </CardContent>
          </Card>

          <div id="additional-controls" className="space-y-4">
            <Card
              id="regulatory-terminology"
              className="scroll-mt-6 border-slate-200 shadow-none dark:border-slate-800"
            >
              <CardHeader>
                <CardTitle>
                  <GeneratedValue value={t('regulatoryTerminology')} />
                </CardTitle>
                <CardDescription>
                  <GeneratedValue value={t('regulatoryTerminologyDescription')} />
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={tGeneratedValue(t('authorityName'))}>
                  <Input
                    name="authorityName"
                    required
                    maxLength={160}
                    defaultValue={regulatory.authorityName}
                  />
                </Field>
                <Field label={tGeneratedValue(t('authorityAbbreviation'))}>
                  <Input
                    name="authorityAbbreviation"
                    required
                    maxLength={24}
                    defaultValue={regulatory.authorityAbbreviation}
                  />
                </Field>
                <Field label={tGeneratedValue(t('legislationName'))}>
                  <Input
                    name="legislationName"
                    required
                    maxLength={200}
                    defaultValue={regulatory.legislationName}
                  />
                </Field>
                <Field label={tGeneratedValue(t('legislationAbbreviation'))}>
                  <Input
                    name="legislationAbbreviation"
                    required
                    maxLength={24}
                    defaultValue={regulatory.legislationAbbreviation}
                  />
                </Field>
                <Field
                  label={tGeneratedValue(t('otherApplicableLegislation'))}
                  className="sm:col-span-2"
                >
                  <Textarea
                    name="otherApplicableLegislation"
                    rows={3}
                    maxLength={2000}
                    defaultValue={regulatory.otherApplicableLegislation}
                    placeholder={tGeneratedValue(t('otherApplicableLegislationPlaceholder'))}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card
              id="languages"
              className="scroll-mt-6 border-slate-200 shadow-none dark:border-slate-800"
            >
              <CardHeader>
                <CardTitle>
                  <GeneratedValue value={t('languages')} />
                </CardTitle>
                <CardDescription>
                  <GeneratedValue value={t('languagesDescription')} />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <GeneratedValue
                    value={LOCALE_OPTIONS.map((l) => (
                      <label
                        key={l.value}
                        className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                      >
                        <input
                          type="checkbox"
                          name={`lang_${l.value}`}
                          defaultChecked={enabled.has(l.value)}
                        />
                        <GeneratedValue value={languages(l.value)} />
                      </label>
                    ))}
                  />
                </div>
                <Field label={tGeneratedValue(t('defaultLanguage'))}>
                  <Select
                    name="defaultLanguage"
                    defaultValue={tenant.defaultLanguage}
                    className="h-10 w-32 pl-3 text-sm"
                  >
                    {LOCALE_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {languages(l.value)}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <GeneratedValue value={t('defaultLanguageHelp')} />
                  </p>
                </Field>
              </CardContent>
            </Card>
          </div>
        </SettingsForm>
      </div>
    </PageContainer>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block space-y-1.5 ${className ?? ''}`}>
      <span className="text-sm font-medium">
        <GeneratedValue value={label} />
      </span>
      <GeneratedValue value={children} />
    </label>
  )
}

async function SettingsSidebar({
  tenant,
  overview,
}: {
  tenant: { name: string; slug: string }
  overview: {
    properties: number
    rooms: number
    users: number
    modules: number
  }
}) {
  const t = await getTranslations('TenantSettings')
  const counts = [
    [t('properties'), overview.properties],
    [t('rooms'), overview.rooms],
    [t('users'), overview.users],
    ['Configured modules', overview.modules],
  ]
  const actions = [
    { href: '/admin/users/invite', label: t('inviteUser'), icon: UserPlus },
    { href: '/admin/users', label: t('manageUsers'), icon: Users },
    { href: '/admin/navigation', label: t('manageModules'), icon: LayoutGrid },
    { href: '/admin/audit', label: t('viewAuditLog'), icon: FileText },
  ]
  return (
    <>
      <Card className="border-slate-200 shadow-none dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-100">
            <Building2 className="text-teal-700" size={22} />
            {t('tenantOverview')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div className="rounded-full bg-teal-50 p-3 text-teal-700">
              <Building2 size={26} />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">{tenant.name}</p>
              <p className="text-sm text-slate-500">{tenant.slug}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-4 gap-2">
            {counts.map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</dt>
                <dd className="text-xs text-slate-500">{label}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-none dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-100">
            <Settings className="text-teal-700" size={22} />
            {t('quickActions')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          {actions.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-12 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50 dark:border-slate-800"
            >
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </CardContent>
      </Card>
      <Card className="border-slate-200 bg-teal-50/60 shadow-none dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-100">
            <Info className="text-teal-700" size={22} />
            {t('aboutTheseSettings')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-slate-700">
          {t('aboutTheseSettingsDescription')}
          <p className="mt-3">{t('propertyOverrideNote')}</p>
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-none dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-100">
            <CircleHelp className="text-teal-700" size={22} />
            {t('needHelp')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-slate-600">
          {t('helpDescription')}
          <Link
            href="/help"
            className="mt-3 flex items-center gap-2 font-medium text-teal-700 hover:underline"
          >
            {t('openUserGuide')} <span aria-hidden="true">→</span>
          </Link>
        </CardContent>
      </Card>
    </>
  )
}

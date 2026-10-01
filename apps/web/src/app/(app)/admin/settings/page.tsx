import { getGeneratedValueTranslations, getGeneratedTranslations } from '@/i18n/generated.server'
import { GeneratedValue } from '@/i18n/generated'
import Image from 'next/image'
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
  Label,
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
import { resolveTenantLogoUrl } from '@beaconhs/storage'
import { can, resolveRegulatoryTerminology } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { levelLabel } from '@/lib/org-hierarchy'
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

const LEVELS = ['customer', 'project', 'site', 'area'] as const

// Tenant settings is admin configuration. saveSettings bypasses RLS to write
// the global tenants row, so it must self-gate (a POST endpoint isn't protected
// by the page render gate). `can` returns true for super-admins.
async function requireSettingsAdmin() {
  const ctx = await requireRequestContext()
  if (!can(ctx, 'admin.settings.manage')) redirect('/admin')
  return ctx
}

type SettingsSection = 'general' | 'branding' | 'advanced'

export default async function AdminSettingsPage() {
  return <SettingsPage activeSection="general" />
}

export async function SettingsPage({ activeSection }: { activeSection: SettingsSection }) {
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
  const hierarchy = tenant.hierarchy
  const regulatory = resolveRegulatoryTerminology(tenant.settings)
  const tenantLogoUrl = await resolveTenantLogoUrl({
    tenantId: tenant.id,
    logoUrl: tenant.branding.logoUrl,
  })

  return (
    <PageContainer className="max-w-[100rem] py-5 sm:py-6">
      <div className="space-y-4">
        <div className="border-b border-blue-100 pb-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-blue-700">
            <Link href="/dashboard">{t('home')}</Link>
            <span>›</span>
            <span>{t('title')}</span>
            <span>›</span>
            <span className="font-medium text-slate-900">{t(activeSection)}</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
              <Settings size={34} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-blue-950">{t('title')}</h1>
              <p className="mt-1 text-sm text-blue-700">{t('pageDescription')}</p>
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
          <Card id="operational-defaults" className="scroll-mt-6 border-blue-100 shadow-sm">
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
                <Input name="operationalLocale" defaultValue={tenant.operationalLocale} required />
              </Field>
              <Field label={tGeneratedValue(t('operationalTimezone'))}>
                <Input
                  name="operationalTimezone"
                  defaultValue={tenant.operationalTimezone}
                  required
                />
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
                <Input
                  name="defaultCurrencyCode"
                  defaultValue={tenant.defaultCurrencyCode}
                  maxLength={3}
                  className="font-mono uppercase"
                  required
                />
              </Field>
            </CardContent>
          </Card>

          <Card id="identity" className="scroll-mt-6 border-blue-100 shadow-sm">
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
            <Card id="regulatory-terminology" className="scroll-mt-6 border-blue-100 shadow-sm">
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

            <Card id="branding" className="scroll-mt-6 border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle>
                  <GeneratedValue value={t('branding')} />
                </CardTitle>
                <CardDescription>
                  <GeneratedValue value={t('brandingDescription')} />
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={tGeneratedValue(t('logoUrl'))}>
                  <Input
                    name="logoUrl"
                    defaultValue={tenant.branding.logoUrl ?? ''}
                    placeholder="https://…"
                  />
                </Field>
                <Field label={tGeneratedValue(t('primaryColor'))}>
                  <Input
                    name="primaryColor"
                    defaultValue={tenant.branding.primaryColor ?? ''}
                    placeholder={tGenerated('m_15e421af604eae')}
                  />
                </Field>
                <Field label={tGeneratedValue(t('pdfLetterhead'))} className="sm:col-span-2">
                  <Input
                    name="pdfLetterhead"
                    defaultValue={tenant.branding.pdfLetterhead ?? ''}
                    placeholder={tGenerated('m_0a8cab85b1e5ec')}
                  />
                </Field>
                <GeneratedValue
                  value={
                    tenantLogoUrl ? (
                      <div className="sm:col-span-2">
                        <Label className="text-xs">
                          <GeneratedValue value={t('preview')} />
                        </Label>
                        <div className="mt-1 flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                          <Image
                            src={tenantLogoUrl}
                            alt=""
                            width={160}
                            height={32}
                            unoptimized
                            className="h-8 w-auto"
                          />
                          <span
                            className="font-semibold"
                            style={{
                              color: tenant.branding.primaryColor ?? '#0f766e',
                            }}
                          >
                            <GeneratedValue value={tenant.name} />
                          </span>
                        </div>
                      </div>
                    ) : null
                  }
                />
              </CardContent>
            </Card>

            <Card id="languages" className="scroll-mt-6 border-blue-100 shadow-sm">
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

            <Card id="hierarchy" className="scroll-mt-6 border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle>
                  <GeneratedValue value={t('hierarchyDepth')} />
                </CardTitle>
                <CardDescription>
                  <GeneratedValue value={t('hierarchyDescription')} />
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <GeneratedValue
                  value={LEVELS.map((lvl) => (
                    <label
                      key={lvl}
                      className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                    >
                      <input type="checkbox" name={`lvl_${lvl}`} defaultChecked={hierarchy[lvl]} />
                      <GeneratedValue value={levelLabel(lvl)} />
                    </label>
                  ))}
                />
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
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label>
        <GeneratedValue value={label} />
      </Label>
      <GeneratedValue value={children} />
    </div>
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
    [t('modules'), overview.modules],
  ]
  const actions = [
    { href: '/admin/users/invite', label: t('inviteUser'), icon: UserPlus },
    { href: '/admin/users', label: t('manageUsers'), icon: Users },
    { href: '/admin/navigation', label: t('manageModules'), icon: LayoutGrid },
    { href: '/admin/audit', label: t('viewAuditLog'), icon: FileText },
  ]
  return (
    <>
      <Card className="border-blue-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-blue-950">
            <Building2 className="text-blue-600" size={22} />
            {t('tenantOverview')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 border-b border-blue-100 pb-4">
            <div className="rounded-full bg-blue-50 p-3 text-blue-600">
              <Building2 size={26} />
            </div>
            <div>
              <p className="font-semibold text-blue-950">{tenant.name}</p>
              <p className="text-sm text-slate-500">{tenant.slug}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-4 gap-2">
            {counts.map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xl font-bold text-blue-950">{value}</dt>
                <dd className="text-xs text-slate-500">{label}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card className="border-blue-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-blue-950">
            <Settings className="text-blue-600" size={22} />
            {t('quickActions')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          {actions.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-12 items-center gap-2 rounded-md border border-blue-100 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
            >
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </CardContent>
      </Card>
      <Card className="border-blue-100 bg-blue-50/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-blue-950">
            <Info className="text-blue-600" size={22} />
            {t('aboutTheseSettings')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-blue-800">
          {t('aboutTheseSettingsDescription')}
          <p className="mt-3">{t('propertyOverrideNote')}</p>
        </CardContent>
      </Card>
      <Card className="border-blue-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-blue-950">
            <CircleHelp className="text-blue-600" size={22} />
            {t('needHelp')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-slate-600">
          {t('helpDescription')}
          <Link
            href="/help"
            className="mt-3 flex items-center gap-2 font-medium text-blue-700 hover:underline"
          >
            {t('openUserGuide')} <span aria-hidden="true">→</span>
          </Link>
        </CardContent>
      </Card>
    </>
  )
}

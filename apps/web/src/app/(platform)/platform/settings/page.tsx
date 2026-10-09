import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import Link from 'next/link'
import { BookOpen, Globe, Info, Settings, UserPlus, Building2, Zap, Boxes } from 'lucide-react'
import { Select } from '@beaconhs/ui'
import { requirePlatformOperator } from '@/lib/auth'
import { getPlatformRegionalDefaults } from '@/lib/platform-regional-defaults'
import { DATE_FORMATS } from '@/lib/tenant-operational-defaults'
import { PageContainer } from '@/components/page-layout'
import { PlatformSettingsNavigation } from '@/components/platform-settings-navigation'
import { PlatformOverview } from '@/components/platform-overview'
import { PlatformBrandingForm } from '../branding/_form'
import { savePlatformRegionalDefaults } from './_actions'

export const dynamic = 'force-dynamic'

export default async function PlatformGeneralSettingsPage() {
  const tVisual = await getGeneratedValueTranslations()

  await requirePlatformOperator()
  const defaults = await getPlatformRegionalDefaults()
  const fields = [
    {
      name: 'locale',
      label: 'Default language (locale)',
      help: 'Sets the default language for new tenants.',
      value: defaults.locale,
      options: [
        ['en-GB', 'English (United Kingdom)'],
        ['en', 'English'],
        ['fr', 'French'],
        ['es', 'Spanish'],
      ],
    },
    {
      name: 'timezone',
      label: 'Default time zone',
      help: 'Sets the default time zone for new tenants.',
      value: defaults.timezone,
      options: [
        ['Europe/London', 'London — Europe/London'],
        ['UTC', 'Coordinated Universal Time (UTC)'],
        ['Europe/Paris', 'Paris — Europe/Paris'],
        ['America/New_York', 'New York — America/New_York'],
        ['Asia/Dubai', 'Dubai — Asia/Dubai'],
      ],
    },
    {
      name: 'dateFormat',
      label: 'Date format',
      help: 'Sets how dates are displayed across the platform.',
      value: defaults.dateFormat,
      options: DATE_FORMATS.map((value) => [
        value,
        value === 'DD/MM/YYYY' ? 'DD/MM/YYYY (e.g. 31/12/2026)' : value,
      ]),
    },
    {
      name: 'numberFormat',
      label: 'Number format',
      help: 'Sets the display of numbers and separators.',
      value: defaults.numberFormat,
      options: [
        ['standard', '1,234.56 — Standard'],
        ['compact', '1.2K — Compact'],
      ],
    },
    {
      name: 'currencyCode',
      label: 'Default currency (ISO code)',
      help: 'Sets the default currency for financial data.',
      value: defaults.currencyCode,
      options: [
        ['GBP', 'GBP – British Pound (£)'],
        ['EUR', 'EUR – Euro (€)'],
        ['USD', 'USD – US Dollar ($)'],
        ['AED', 'AED – UAE Dirham'],
      ],
    },
  ]
  return (
    <PageContainer className="uvanoo-settings max-w-[100rem] lg:p-6">
      <PlatformOverview />
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.46fr)]">
        <div className="min-w-0 space-y-5">
          <nav
            aria-label={tVisual('Breadcrumb')}
            className="flex flex-wrap gap-3 text-sm text-[#546f9c]"
          >
            <Link href="/platform">{tVisual('Platform Admin')}</Link>
            <span aria-hidden>›</span>
            <span>{tVisual('Global Settings')}</span>
            <span aria-hidden>›</span>
            <span className="font-semibold text-[#101b55]">{tVisual('General Settings')}</span>
          </nav>
          <header>
            <h2 className="flex items-center gap-4 text-3xl font-bold tracking-tight text-[#101b55]">
              <Settings size={36} />
              {tVisual('General Settings')}
            </h2>
            <p className="mt-2 text-sm text-[#546f9c]">
              {tVisual(
                'Manage the default settings for the platform. Existing tenant data will not be changed.',
              )}
            </p>
          </header>
          <PlatformSettingsNavigation active="General" />
          <section className="rounded-lg border border-blue-100 bg-white p-5">
            <header className="mb-7 flex gap-4">
              <Globe size={30} className="shrink-0 text-blue-600" />
              <div>
                <h3 className="text-xl font-semibold text-[#101b55]">
                  {tVisual('Regional and format settings')}
                </h3>
                <p className="mt-1 text-sm text-[#546f9c]">
                  {tVisual(
                    'Default locale, date, time, number and currency formats for newly created tenants.',
                  )}
                </p>
              </div>
            </header>
            <PlatformBrandingForm
              key={JSON.stringify(defaults)}
              action={savePlatformRegionalDefaults}
              saveLabel="Save changes"
            >
              {fields.map((field) => (
                <label
                  key={field.name}
                  className="grid items-center gap-3 md:grid-cols-[0.8fr_1fr]"
                >
                  <span>
                    <span className="block text-sm font-semibold text-[#101b55]">
                      {tVisual(field.label)}
                    </span>
                    <span className="mt-1 block text-xs text-[#546f9c]">{tVisual(field.help)}</span>
                  </span>
                  <Select
                    name={field.name}
                    aria-label={tVisual(field.label)}
                    defaultValue={field.value}
                    required
                  >
                    {!field.options.some(([value]) => value === field.value) && (
                      <option value={field.value}>{field.value}</option>
                    )}
                    {field.options.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </PlatformBrandingForm>
          </section>
        </div>
        <aside className="space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-5">
            <h2 className="flex items-center gap-3 text-xl font-semibold text-[#101b55]">
              <Zap className="text-blue-600" />
              {tVisual('Quick Actions')}
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { href: '/platform/tenants/new', label: 'Add Tenant', icon: Building2 },
                { href: '/platform/users', label: 'Manage Users', icon: UserPlus },
                { href: '/platform/modules', label: 'Manage Modules', icon: Boxes },
              ].map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href as never}
                  className="flex items-center gap-3 rounded-md border border-blue-100 p-3 text-sm text-blue-600 hover:bg-blue-50"
                >
                  <Icon size={23} />
                  {tVisual(label)}
                </Link>
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-blue-100 bg-[#eef7ff] p-5">
            <h2 className="flex gap-3 text-xl font-semibold text-[#101b55]">
              <Info className="shrink-0 text-blue-600" />
              {tVisual('About these settings')}
            </h2>
            <p className="mt-4 pl-9 text-sm leading-6 text-[#546f9c]">
              {tVisual(
                'These defaults apply when a tenant is created. Existing tenants retain their saved values. Tenant administrators can override their organisation’s settings.',
              )}
            </p>
          </section>
          <section className="rounded-lg border border-blue-100 bg-white p-5">
            <h2 className="flex gap-3 text-xl font-semibold text-[#101b55]">
              <BookOpen className="text-blue-600" />
              {tVisual('Need help?')}
            </h2>
            <p className="mt-4 pl-9 text-sm leading-6 text-[#546f9c]">
              {tVisual('Learn more about platform and tenant settings.')}
            </p>
            <Link href="/help" className="mt-3 block pl-9 text-sm text-blue-600 underline">
              {tVisual('View help centre →')}
            </Link>
          </section>
        </aside>
      </div>
    </PageContainer>
  )
}

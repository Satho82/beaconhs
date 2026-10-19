import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Button, Card, CardContent, Input, PageHeader, Select, Textarea } from '@beaconhs/ui'
import { can } from '@beaconhs/tenant'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Droplets,
  Flame,
  Plus,
  Zap,
} from 'lucide-react'
import { PageContainer } from '@/components/page-layout'
import { SearchInput } from '@/components/search-input'
import { requireRequestContext } from '@/lib/auth'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'
import { resolveTenantOperationalDefaultsForContext } from '@/lib/tenant-operational-defaults'
import {
  addReading,
  addTariff,
  createMeter,
  listMetering,
  setMeterActive,
  updateMeter,
  type MeterType,
  type ReadingType,
} from '@/lib/hospitality/metering'

const BASE = '/hospitality/metering'
const tabs = ['overview', 'enter-reading', 'history', 'analytics', 'setup'] as const
type Tab = (typeof tabs)[number]
const meterTypes: MeterType[] = ['electricity', 'gas', 'water', 'custom']
const currencyOptions =
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('currency')
    : ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'AED']

function text(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim()
}
function number(form: FormData, key: string) {
  const value = Number(text(form, key))
  if (!Number.isFinite(value)) throw new Error(`${key} is invalid.`)
  return value
}
async function create(form: FormData) {
  'use server'
  const meterType = text(form, 'meterType') as MeterType
  if (!meterTypes.includes(meterType)) throw new Error('Invalid meter type.')
  await createMeter(await requireRequestContext(), {
    propertyId: text(form, 'propertyId'),
    name: text(form, 'name'),
    meterType,
    location: text(form, 'location'),
    serialNumber: text(form, 'serialNumber'),
    mpan: text(form, 'mpan') || undefined,
    measurementUnit: text(form, 'measurementUnit'),
    notes: text(form, 'notes') || undefined,
    installedAt: text(form, 'installedAt'),
    openingReading: number(form, 'openingReading'),
    previousMeterId: text(form, 'previousMeterId') || undefined,
    replacementDate: text(form, 'replacementDate') || undefined,
  })
  revalidatePath(BASE)
}
async function tariff(form: FormData) {
  'use server'
  await addTariff(await requireRequestContext(), {
    meterId: text(form, 'meterId'),
    unitCost: number(form, 'unitCost'),
    currency: text(form, 'currency'),
    effectiveFrom: new Date(text(form, 'effectiveFrom')),
  })
  revalidatePath(BASE)
}
async function reading(form: FormData) {
  'use server'
  const readingType = text(form, 'readingType') as ReadingType
  if (!['normal', 'corrected', 'reset'].includes(readingType))
    throw new Error('Invalid reading type.')
  await addReading(await requireRequestContext(), {
    meterId: text(form, 'meterId'),
    readingValue: number(form, 'readingValue'),
    readAt: new Date(text(form, 'readAt')),
    notes: text(form, 'notes') || undefined,
    readingType,
    replacesReadingId: text(form, 'replacesReadingId') || undefined,
  })
  revalidatePath(BASE)
}
async function edit(form: FormData) {
  'use server'
  await updateMeter(await requireRequestContext(), {
    meterId: text(form, 'meterId'),
    name: text(form, 'name'),
    location: text(form, 'location'),
    serialNumber: text(form, 'serialNumber'),
    mpan: text(form, 'mpan') || undefined,
    measurementUnit: text(form, 'measurementUnit'),
    notes: text(form, 'notes') || undefined,
  })
  revalidatePath(BASE)
}
async function toggle(form: FormData) {
  'use server'
  await setMeterActive(
    await requireRequestContext(),
    text(form, 'meterId'),
    text(form, 'active') === 'true',
  )
  revalidatePath(BASE)
}
function money(value: number | string | null, currency: string | null, locale: string) {
  if (value == null || !currency) return '-'
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(value))
}
type AnalyticsPoint = { label: string; value: number }

function analyticsSeries(
  readings: Array<{
    readAt: Date
    consumption: number | string | null
    expenditure: number | string | null
  }>,
  interval: string,
  field: 'consumption' | 'expenditure',
): AnalyticsPoint[] {
  const buckets = new Map<string, number>()
  for (const item of readings) {
    const date = new Date(item.readAt)
    let key = date.toISOString().slice(0, 10)
    if (interval === 'annual') key = String(date.getUTCFullYear())
    else if (interval === 'monthly') key = key.slice(0, 7)
    else if (interval === 'weekly') {
      const monday = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      )
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
      key = monday.toISOString().slice(0, 10)
    }
    buckets.set(key, (buckets.get(key) ?? 0) + Number(item[field] ?? 0))
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }))
}

function Chart({
  series,
  label,
  emptyLabel,
  unit,
  axisLabel,
  dateLabel,
}: {
  series: AnalyticsPoint[]
  label: string
  emptyLabel: string
  unit: string
  axisLabel: string
  dateLabel: string
}) {
  if (!series.length) return <p className="text-muted-foreground text-sm">{emptyLabel}</p>

  const max = Math.max(...series.map((point) => point.value), 1)
  const plot = { left: 18, right: 96, top: 8, bottom: 82 }
  const coordinate = (point: AnalyticsPoint, index: number) => ({
    x: plot.left + (index / Math.max(series.length - 1, 1)) * (plot.right - plot.left),
    y: plot.bottom - (point.value / max) * (plot.bottom - plot.top),
  })
  const coordinates = series.map(coordinate)
  const points = coordinates.map(({ x, y }) => `${x},${y}`).join(' ')
  const xLabels = series.length <= 3 ? series : [series[0]!, series[series.length - 1]!]

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <svg
        viewBox="0 0 100 100"
        className="bg-muted/20 h-56 w-full rounded border"
        role="img"
        aria-label={axisLabel}
      >
        <line
          x1={plot.left}
          y1={plot.top}
          x2={plot.left}
          y2={plot.bottom}
          stroke="currentColor"
          strokeWidth="0.5"
        />
        <line
          x1={plot.left}
          y1={plot.bottom}
          x2={plot.right}
          y2={plot.bottom}
          stroke="currentColor"
          strokeWidth="0.5"
        />
        <line
          x1={plot.left}
          y1={plot.top}
          x2={plot.right}
          y2={plot.top}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeDasharray="2 2"
          strokeWidth="0.4"
        />
        <text x="2" y={plot.top + 2} fontSize="4" fill="currentColor">
          {max.toFixed(2)} {unit}
        </text>
        <text x="2" y={plot.bottom} fontSize="4" fill="currentColor">
          0 {unit}
        </text>
        <text x="8" y="48" fontSize="4" fill="currentColor" transform="rotate(-90 8 48)">
          {unit}
        </text>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
        {coordinates.map(({ x, y }, index) => (
          <circle key={series[index]!.label} cx={x} cy={y} r="2.2" fill="currentColor">
            <title>{`${series[index]!.label}: ${series[index]!.value.toFixed(2)} ${unit}`}</title>
          </circle>
        ))}
        {xLabels.map((point) => {
          const index = series.indexOf(point)
          const { x } = coordinates[index]!
          return (
            <text
              key={point.label}
              x={x}
              y="92"
              textAnchor="middle"
              fontSize="3.5"
              fill="currentColor"
            >
              {point.label}
            </text>
          )
        })}
        <text x="57" y="99" textAnchor="middle" fontSize="4" fill="currentColor">
          {dateLabel}
        </text>
      </svg>
    </div>
  )
}

export default async function MeteringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getGeneratedValueTranslations()
  const ctx = await requireRequestContext()
  const operationalDefaults = await resolveTenantOperationalDefaultsForContext(ctx)
  const propertyContext = await resolveHospitalityPropertyContext(ctx)
  const search = await searchParams
  const rawTab = typeof search.tab === 'string' ? search.tab : 'overview'
  const tab: Tab = tabs.includes(rawTab as Tab) ? (rawTab as Tab) : 'overview'
  const q = typeof search.q === 'string' ? search.q : ''
  const interval =
    typeof search.interval === 'string' &&
    ['daily', 'weekly', 'monthly', 'annual'].includes(search.interval)
      ? search.interval
      : 'monthly'
  const from =
    typeof search.from === 'string' && search.from ? new Date(search.from + 'T00:00:00.000Z') : null
  const to =
    typeof search.to === 'string' && search.to ? new Date(search.to + 'T23:59:59.999Z') : null
  const propertyIds = propertyContext.activePropertyId
    ? [propertyContext.activePropertyId]
    : propertyContext.properties.map((property) => property.id)
  const data = await listMetering(ctx, { propertyIds, q })
  const mayManage = can(ctx, 'hospitality.manage')
  const now = new Date()
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
  const latestByMeter = new Map<string, (typeof data.readings)[number]>()
  for (const item of data.readings)
    if (!latestByMeter.has(item.meterId)) latestByMeter.set(item.meterId, item)
  const analyticsReadings = data.readings.filter(
    (item) => (!from || item.readAt >= from) && (!to || item.readAt <= to),
  )
  const consumptionSeries = analyticsSeries(analyticsReadings, interval, 'consumption')
  const spendSeries = analyticsSeries(analyticsReadings, interval, 'expenditure')
  const measurementUnits = [...new Set(data.meters.map((meter) => meter.measurementUnit))]
  const consumptionUnit = measurementUnits.length === 1 ? measurementUnits[0]! : 'mixed units'
  const currencies = [
    ...new Set(analyticsReadings.map((reading) => reading.currency).filter(Boolean)),
  ]
  const expenditureUnit = currencies.length === 1 ? currencies[0]! : 'mixed currencies'
  const utilitySummary = (type: MeterType) => {
    const meters = data.meters.filter((meter) => meter.meterType === type)
    const meterIds = new Set(meters.map((meter) => meter.id))
    const readings = analyticsReadings.filter((reading) => meterIds.has(reading.meterId))
    return {
      consumption: readings.reduce((total, reading) => total + Number(reading.consumption ?? 0), 0),
      expenditure: readings.reduce((total, reading) => total + Number(reading.expenditure ?? 0), 0),
      unit: meters.length === 1 ? (meters[0]?.measurementUnit ?? '') : t('mixed units'),
      currency:
        [...new Set(readings.map((reading) => reading.currency).filter(Boolean))].at(0) ?? null,
    }
  }
  const electricity = utilitySummary('electricity')
  const water = utilitySummary('water')
  const gas = utilitySummary('gas')
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const priorPeriod = (type: MeterType) => {
    const meterIds = new Set(
      data.meters.filter((meter) => meter.meterType === type).map((meter) => meter.id),
    )
    return data.readings
      .filter(
        (item) =>
          item.readAt >= previousMonthStart &&
          item.readAt < monthStart &&
          meterIds.has(item.meterId),
      )
      .reduce((total, item) => total + Number(item.consumption ?? 0), 0)
  }
  const meterRows = data.meters
    .map((meter) => {
      const readings = data.readings.filter((item) => item.meterId === meter.id)
      const consumption = readings.reduce((total, item) => total + Number(item.consumption ?? 0), 0)
      const expenditure = readings.reduce((total, item) => total + Number(item.expenditure ?? 0), 0)
      return {
        meter,
        consumption,
        expenditure,
        tariff: data.tariffs.find((item) => item.meterId === meter.id),
      }
    })
    .sort((a, b) => b.consumption - a.consumption)
  const latestReadings = [...data.readings]
    .sort((a, b) => b.readAt.getTime() - a.readAt.getTime())
    .slice(0, 5)
  const inactiveMeters = data.meters.filter((meter) => !meter.active)
  const monthLabel = now.toLocaleDateString(operationalDefaults.locale, {
    month: 'long',
    year: 'numeric',
  })

  return (
    <PageContainer>
      <PageHeader
        title={t('Metering')}
        description={t(
          'Property utility readings, consumption, tariffs and estimated expenditure.',
        )}
      />
      <nav className="my-5 flex flex-wrap gap-2" aria-label={t('Metering sections')}>
        {tabs
          .filter((item) => item !== 'setup' || mayManage)
          .map((item) => (
            <Button key={item} asChild variant={tab === item ? 'default' : 'outline'} size="sm">
              <Link href={`${BASE}?tab=${item}`}>
                {t(
                  item
                    .split('-')
                    .map((part) => part[0]?.toUpperCase() + part.slice(1))
                    .join(' '),
                )}
              </Link>
            </Button>
          ))}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-teal-700 uppercase">
                  {t('Metering')} · {t('Overview')}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {t(
                    'Monitor utility consumption, cost and operational performance across your authorised properties.',
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                  {monthLabel}
                </span>
                <SearchInput placeholder={t('Search meter, Serial Number or MPAN')} />
                <Button asChild className="bg-teal-700 text-white hover:bg-teal-800">
                  <Link href={`${BASE}?tab=enter-reading`}>
                    <Plus size={16} aria-hidden="true" /> {t('Add reading')}
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: t('Electricity'),
                icon: Zap,
                summary: electricity,
                prior: priorPeriod('electricity'),
                tone: 'bg-teal-50 text-teal-700',
              },
              {
                label: t('Water'),
                icon: Droplets,
                summary: water,
                prior: priorPeriod('water'),
                tone: 'bg-sky-50 text-sky-700',
              },
              {
                label: t('Gas'),
                icon: Flame,
                summary: gas,
                prior: priorPeriod('gas'),
                tone: 'bg-orange-50 text-orange-700',
              },
              {
                label: t('Active meters'),
                icon: Activity,
                summary: {
                  consumption: data.meters.filter((meter) => meter.active).length,
                  expenditure: 0,
                  unit: t('meters'),
                  currency: null,
                },
                prior: 0,
                tone: 'bg-violet-50 text-violet-700',
              },
            ].map(({ label, icon: Icon, summary, prior, tone }) => {
              const change = prior ? ((summary.consumption - prior) / prior) * 100 : null
              const improving = change != null && change <= 0
              return (
                <Card key={label} className="overflow-hidden border-slate-200 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-600">{label}</p>
                        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                          {summary.consumption.toLocaleString(operationalDefaults.locale, {
                            maximumFractionDigits: 2,
                          })}
                          <span className="ml-1 text-sm font-medium text-slate-500">
                            {summary.unit}
                          </span>
                        </p>
                      </div>
                      <span className={`rounded-xl p-3 ${tone}`}>
                        <Icon size={20} aria-hidden="true" />
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs">
                      {summary.currency ? (
                        <span className="font-medium text-slate-700">
                          {money(summary.expenditure, summary.currency, operationalDefaults.locale)}
                        </span>
                      ) : (
                        <span className="text-slate-400">{t('No cost recorded')}</span>
                      )}
                      {change != null ? (
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${improving ? 'text-teal-700' : 'text-orange-700'}`}
                        >
                          {improving ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                          {Math.abs(change).toFixed(1)}% {t('vs previous month')}
                        </span>
                      ) : (
                        <span className="text-slate-400">{t('No prior period')}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.9fr)]">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-950">{t('Consumption trend')}</h2>
                    <p className="text-sm text-slate-500">
                      {t('Recorded consumption by reporting period')}
                    </p>
                  </div>
                  <BarChart3 className="text-teal-700" size={20} aria-hidden="true" />
                </div>
                <div className="text-teal-700">
                  <Chart
                    series={consumptionSeries}
                    label={t('All utilities')}
                    emptyLabel={t('No recorded consumption for this period.')}
                    unit={consumptionUnit}
                    axisLabel={t('Consumption trend')}
                    dateLabel={t('Date')}
                  />
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-950">{t('Cost trend')}</h2>
                    <p className="text-sm text-slate-500">
                      {t('Estimated expenditure from recorded tariffs')}
                    </p>
                  </div>
                  <span className="rounded-lg bg-orange-50 p-2 text-orange-700">
                    <Activity size={18} aria-hidden="true" />
                  </span>
                </div>
                <div className="text-orange-700">
                  <Chart
                    series={spendSeries}
                    label={t('Recorded cost')}
                    emptyLabel={t('No cost data for this period.')}
                    unit={expenditureUnit}
                    axisLabel={t('Cost trend')}
                    dateLabel={t('Date')}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.9fr)]">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-slate-950">{t('Latest readings')}</h2>
                    <p className="text-sm text-slate-500">
                      {t('Most recent readings across your authorised properties')}
                    </p>
                  </div>
                  <Link
                    className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                    href={`${BASE}?tab=history`}
                  >
                    {t('View all')}
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th className="px-5 py-3">{t('Date')}</th>
                        <th className="px-5 py-3">{t('Meter')}</th>
                        <th className="px-5 py-3">{t('Property')}</th>
                        <th className="px-5 py-3 text-right">{t('Reading')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {latestReadings.map((item) => {
                        const meter = data.meters.find((candidate) => candidate.id === item.meterId)
                        return (
                          <tr key={item.id} className="text-slate-700">
                            <td className="px-5 py-3 whitespace-nowrap">
                              {item.readAt.toLocaleDateString(operationalDefaults.locale)}
                            </td>
                            <td className="px-5 py-3 font-medium text-slate-950">
                              {meter?.name ?? t('Meter')}
                            </td>
                            <td className="px-5 py-3">{meter?.propertyName ?? '-'}</td>
                            <td className="px-5 py-3 text-right font-semibold">
                              {item.readingValue} {meter?.measurementUnit}
                            </td>
                          </tr>
                        )
                      })}
                      {!latestReadings.length && (
                        <tr>
                          <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                            {t('No readings have been recorded yet.')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-950">{t('Unit costs')}</h2>
                      <p className="text-sm text-slate-500">{t('Current recorded tariffs')}</p>
                    </div>
                    <Link
                      className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                      href={`${BASE}?tab=setup`}
                    >
                      {t('Manage')}
                    </Link>
                  </div>
                  <div className="mt-4 divide-y divide-slate-100">
                    {meterRows.slice(0, 4).map(({ meter, tariff }) => (
                      <div
                        key={meter.id}
                        className="flex items-center justify-between py-3 text-sm"
                      >
                        <span className="font-medium text-slate-700">{meter.name}</span>
                        <span className="text-slate-950">
                          {tariff
                            ? `${tariff.unitCost} ${tariff.currency} / ${meter.measurementUnit}`
                            : t('No tariff')}
                        </span>
                      </div>
                    ))}
                    {!meterRows.length && (
                      <p className="py-4 text-sm text-slate-500">{t('No meters configured.')}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-950">{t('Alerts & exceptions')}</h2>
                      <p className="text-sm text-slate-500">
                        {t('Operational items requiring review')}
                      </p>
                    </div>
                    <span
                      className={`rounded-lg p-2 ${inactiveMeters.length ? 'bg-orange-50 text-orange-700' : 'bg-teal-50 text-teal-700'}`}
                    >
                      <AlertTriangle size={18} aria-hidden="true" />
                    </span>
                  </div>
                  <div className="mt-4">
                    {inactiveMeters.length ? (
                      inactiveMeters.slice(0, 3).map((meter) => (
                        <div
                          key={meter.id}
                          className="border-b border-slate-100 py-3 last:border-0"
                        >
                          <p className="text-sm font-semibold text-slate-900">{meter.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {t('Meter inactive')} · {meter.propertyName}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl bg-teal-50 px-3 py-4 text-sm text-teal-800">
                        {t('No exceptions are currently detected from the available meter status.')}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-slate-950">{t('Top meters by consumption')}</h2>
                  <p className="text-sm text-slate-500">
                    {t('Ranked from recorded consumption and cost')}
                  </p>
                </div>
                <Link
                  className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                  href={`${BASE}?tab=analytics`}
                >
                  {t('Analytics')}
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-5 py-3">#</th>
                      <th className="px-5 py-3">{t('Meter')}</th>
                      <th className="px-5 py-3">{t('Property')}</th>
                      <th className="px-5 py-3 text-right">{t('Consumption')}</th>
                      <th className="px-5 py-3 text-right">{t('Cost')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {meterRows
                      .slice(0, 5)
                      .map(({ meter, consumption, expenditure, tariff }, index) => (
                        <tr key={meter.id}>
                          <td className="px-5 py-3 text-slate-500">{index + 1}</td>
                          <td className="px-5 py-3 font-semibold text-slate-950">{meter.name}</td>
                          <td className="px-5 py-3 text-slate-600">{meter.propertyName}</td>
                          <td className="px-5 py-3 text-right font-medium">
                            {consumption.toLocaleString(operationalDefaults.locale, {
                              maximumFractionDigits: 2,
                            })}{' '}
                            {meter.measurementUnit}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {money(
                              expenditure,
                              tariff?.currency ?? null,
                              operationalDefaults.locale,
                            )}
                          </td>
                        </tr>
                      ))}
                    {!meterRows.length && (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                          {t('No meters found for the selected property context.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {tab === 'enter-reading' && (
        <Card>
          <CardContent className="pt-6">
            <form action={reading} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>{t('Meter')}</span>
                <Select name="meterId" required>
                  <option value="">Choose a meter</option>
                  {data.meters
                    .filter((m) => m.active)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.serialNumber}
                        {m.mpan ? ` - ${m.mpan}` : ''} {m.location} {m.measurementUnit}
                      </option>
                    ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Reading date/time')}</span>
                <Input name="readAt" type="datetime-local" defaultValue={localNow} required />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Reading value')}</span>
                <Input name="readingValue" type="number" min="0" step="0.000001" required />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Reading type')}</span>
                <Select name="readingType" defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="reset">Meter reset</option>
                  <option value="corrected">Correction</option>
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Reading being corrected (required for correction)')}</span>
                <Select name="replacesReadingId" defaultValue="">
                  <option value="">Not a correction</option>
                  {data.readings.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.readAt.toISOString()} {r.readingValue}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Notes')}</span>
                <Input name="notes" />
              </label>
              <Button type="submit" className="md:col-span-2">
                {t('Record reading')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          <SearchInput placeholder={t('Search meter, Serial Number or MPAN')} />
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3">{t('Date/time')}</th>
                  <th className="p-3">{t('Meter')}</th>
                  <th className="p-3">{t('Reading')}</th>
                  <th className="p-3">{t('Consumption')}</th>
                  <th className="p-3">{t('Tariff')}</th>
                  <th className="p-3">{t('Expenditure')}</th>
                  <th className="p-3">{t('Submitted by')}</th>
                  <th className="p-3">{t('Notes')}</th>
                </tr>
              </thead>
              <tbody>
                {data.readings.map((item) => {
                  const meter = data.meters.find((m) => m.id === item.meterId)
                  return (
                    <tr key={item.id} className="border-b">
                      <td className="p-3">{item.readAt.toLocaleString('en-GB')}</td>
                      <td className="p-3">
                        {meter?.name}
                        <div className="text-muted-foreground text-xs">
                          {meter?.serialNumber}
                          {meter?.mpan ? `  ${meter.mpan}` : ''}
                        </div>
                      </td>
                      <td className="p-3">
                        {item.readingValue} {meter?.measurementUnit}
                      </td>
                      <td className="p-3">{item.consumption ?? '-'}</td>
                      <td className="p-3">
                        {item.unitCost == null ? '-' : `${item.unitCost} ${item.currency}`}
                      </td>
                      <td className="p-3">
                        {money(item.expenditure, item.currency, operationalDefaults.locale)}
                      </td>
                      <td className="p-3">{item.submitterName}</td>
                      <td className="p-3">{item.notes ?? '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'analytics' && (
        <Card>
          <CardContent className="grid gap-8 pt-6 lg:grid-cols-2">
            <form action={BASE} className="grid gap-3 md:grid-cols-4 lg:col-span-2">
              <input type="hidden" name="tab" value="analytics" />
              <label className="space-y-1 text-sm">
                <span>{t('Period')}</span>
                <Select name="interval" defaultValue={interval}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('From')}</span>
                <Input
                  name="from"
                  type="date"
                  defaultValue={typeof search.from === 'string' ? search.from : ''}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('To')}</span>
                <Input
                  name="to"
                  type="date"
                  defaultValue={typeof search.to === 'string' ? search.to : ''}
                />
              </label>
              <Button type="submit" className="self-end">
                {t('Apply filters')}
              </Button>
            </form>
            <Chart
              series={consumptionSeries}
              label={t('Consumption over time')}
              emptyLabel={t('No data for this period.')}
              unit={consumptionUnit}
              axisLabel={t(
                'Chart with dates on the horizontal axis and measurement units on the vertical axis.',
              )}
              dateLabel={t('Date')}
            />
            <Chart
              series={spendSeries}
              label={t('Expenditure over time')}
              emptyLabel={t('No data for this period.')}
              unit={expenditureUnit}
              axisLabel={t(
                'Chart with dates on the horizontal axis and currency on the vertical axis.',
              )}
              dateLabel={t('Date')}
            />
            <p className="text-muted-foreground text-xs lg:col-span-2">
              {t(
                'Charts show recorded readings only; missing periods are not fabricated. Use the global property context to compare authorised properties.',
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {tab === 'setup' && mayManage && (
        <div className="space-y-5">
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-4 font-semibold">{t('Create or replace meter')}</h2>
              <form action={create} className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{t('Property')}</span>
                  <Select
                    name="propertyId"
                    required
                    defaultValue={propertyContext.activePropertyId ?? ''}
                  >
                    <option value="">Choose property</option>
                    {propertyContext.properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Meter name')}</span>
                  <Input name="name" required />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Meter type')}</span>
                  <Select name="meterType" defaultValue="electricity">
                    {meterTypes.map((type) => (
                      <option key={type} value={type}>
                        {type[0]?.toUpperCase()}
                        {type.slice(1)}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Location')}</span>
                  <Input name="location" required />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Meter Serial Number')}</span>
                  <Input name="serialNumber" required />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('MPAN (electricity only)')}</span>
                  <Input name="mpan" />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Measurement unit')}</span>
                  <Input name="measurementUnit" placeholder={t('kWh or cubic metres')} required />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Installation/start date')}</span>
                  <Input name="installedAt" type="date" required />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Opening reading')}</span>
                  <Input name="openingReading" type="number" min="0" step="0.000001" required />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Previous meter (replacement only)')}</span>
                  <Select name="previousMeterId" defaultValue="">
                    <option value="">Not a replacement</option>
                    {data.meters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.serialNumber}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Replacement date')}</span>
                  <Input name="replacementDate" type="date" />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span>{t('Notes')}</span>
                  <Textarea name="notes" />
                </label>
                <Button type="submit" className="md:col-span-2">
                  {t('Create meter')}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-4 font-semibold">{t('Edit meter identity')}</h2>
              <div className="space-y-4">
                {data.meters.map((m) => (
                  <form
                    action={edit}
                    key={m.id}
                    className="grid gap-3 rounded border p-3 md:grid-cols-3"
                  >
                    <input type="hidden" name="meterId" value={m.id} />
                    <label className="space-y-1 text-sm">
                      <span>{t('Meter name')}</span>
                      <Input name="name" defaultValue={m.name} required />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>{t('Location')}</span>
                      <Input name="location" defaultValue={m.location} required />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>{t('Meter Serial Number')}</span>
                      <Input name="serialNumber" defaultValue={m.serialNumber} required />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>{t('MPAN (electricity only)')}</span>
                      <Input name="mpan" defaultValue={m.mpan ?? ''} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>{t('Measurement unit')}</span>
                      <Input name="measurementUnit" defaultValue={m.measurementUnit} required />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>{t('Notes')}</span>
                      <Input name="notes" />
                    </label>
                    <Button type="submit" className="md:col-span-3">
                      {t('Save meter')}
                    </Button>
                  </form>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-4 font-semibold">{t('Add effective-dated tariff')}</h2>
              <form action={tariff} className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{t('Meter')}</span>
                  <Select name="meterId" required>
                    <option value="">Choose meter</option>
                    {data.meters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.serialNumber}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Unit cost')}</span>
                  <Input name="unitCost" type="number" min="0" step="0.000001" required />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Currency')}</span>
                  <Select name="currency" defaultValue={operationalDefaults.currencyCode} required>
                    {currencyOptions.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('Effective from')}</span>
                  <Input
                    name="effectiveFrom"
                    type="datetime-local"
                    defaultValue={localNow}
                    required
                  />
                </label>
                <Button type="submit" className="md:col-span-2">
                  {t('Add tariff')}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-4 font-semibold">{t('Meter lifecycle')}</h2>
              <div className="space-y-3">
                {data.meters.map((m) => (
                  <form
                    action={toggle}
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded border p-3"
                  >
                    <div>
                      <strong>{m.name}</strong>
                      <div className="text-muted-foreground text-sm">
                        {m.serialNumber} {m.active ? t('Active') : t('Inactive')}
                      </div>
                    </div>
                    <input type="hidden" name="meterId" value={m.id} />
                    <input type="hidden" name="active" value={String(!m.active)} />
                    <Button variant="outline" type="submit">
                      {m.active ? t('Deactivate') : t('Activate')}
                    </Button>
                  </form>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  )
}

import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Button, Card, CardContent, Input, PageHeader, Select, Textarea } from '@beaconhs/ui'
import { can } from '@beaconhs/tenant'
import { PageContainer } from '@/components/page-layout'
import { SearchInput } from '@/components/search-input'
import { requireRequestContext } from '@/lib/auth'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'
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
function money(value: number | string | null, currency: string | null) {
  if (value == null || !currency) return '-'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(value))
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
        <div className="space-y-4">
          <SearchInput placeholder={t('Search meter, Serial Number or MPAN')} />
          {!data.meters.length ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center">
                {t('No meters found for the selected property context.')}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.meters.map((meter) => {
                const latest = latestByMeter.get(meter.id)
                const currentTariff = data.tariffs.find((item) => item.meterId === meter.id)
                const meterReadings = data.readings.filter((item) => item.meterId === meter.id)
                const total = meterReadings.reduce(
                  (sum, item) => sum + Number(item.consumption ?? 0),
                  0,
                )
                const spend = meterReadings.reduce(
                  (sum, item) => sum + Number(item.expenditure ?? 0),
                  0,
                )
                const since = (days: number) =>
                  meterReadings
                    .filter((item) => item.readAt >= new Date(now.getTime() - days * 86_400_000))
                    .reduce((sum, item) => sum + Number(item.consumption ?? 0), 0)
                const weekly = since(7)
                const monthly = since(30)
                const annual = since(365)
                const previousMonth = meterReadings
                  .filter(
                    (item) =>
                      item.readAt < new Date(now.getTime() - 30 * 86_400_000) &&
                      item.readAt >= new Date(now.getTime() - 60 * 86_400_000),
                  )
                  .reduce((sum, item) => sum + Number(item.consumption ?? 0), 0)
                const activeDays = meterReadings.length
                  ? Math.max(
                      1,
                      Math.ceil(
                        (now.getTime() -
                          Math.min(...meterReadings.map((item) => item.readAt.getTime()))) /
                          86_400_000,
                      ),
                    )
                  : 0
                return (
                  <Card key={meter.id}>
                    <CardContent className="space-y-2 pt-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 className="font-semibold">{meter.name}</h2>
                          <p className="text-muted-foreground text-sm">
                            {meter.propertyName} {meter.meterType}
                          </p>
                        </div>
                        <span className="text-xs">
                          {meter.active ? t('Active') : t('Inactive')}
                        </span>
                      </div>
                      <dl className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <dt className="text-muted-foreground">{t('Serial Number')}</dt>
                          <dd>{meter.serialNumber}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t('MPAN')}</dt>
                          <dd>{meter.mpan ?? t('Not applicable')}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t('Location')}</dt>
                          <dd>{meter.location}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t('Latest reading')}</dt>
                          <dd>
                            {latest ? `${latest.readingValue} ${meter.measurementUnit}` : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t('Recorded consumption')}</dt>
                          <dd>
                            {total.toFixed(2)} {meter.measurementUnit}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t('Estimated expenditure')}</dt>
                          <dd>{money(spend, currentTariff?.currency ?? null)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t('Weekly consumption')}</dt>
                          <dd>
                            {weekly.toFixed(2)} {meter.measurementUnit}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t('Monthly consumption')}</dt>
                          <dd>
                            {monthly.toFixed(2)} {meter.measurementUnit}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">{t('Annual consumption')}</dt>
                          <dd>
                            {annual.toFixed(2)} {meter.measurementUnit}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            {t('Average daily consumption')}
                          </dt>
                          <dd>
                            {activeDays ? (total / activeDays).toFixed(2) : '-'}{' '}
                            {meter.measurementUnit}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            {t('Previous-period comparison')}
                          </dt>
                          <dd>
                            {previousMonth
                              ? (((monthly - previousMonth) / previousMonth) * 100).toFixed(1) + '%'
                              : '-'}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
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
                      <td className="p-3">{money(item.expenditure, item.currency)}</td>
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
                  <Input name="currency" defaultValue="GBP" maxLength={3} required />
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

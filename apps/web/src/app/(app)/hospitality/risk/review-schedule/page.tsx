import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react'
import { notFound } from 'next/navigation'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Button, EmptyState, PageHeader, Select } from '@beaconhs/ui'
import { RISK_LIBRARY_CATEGORIES } from '@beaconhs/db'
import { riskAssessmentSignoffs, riskHazards, tenantUsers, users } from '@beaconhs/db/schema'
import { PageContainer } from '@/components/page-layout'
import { Pagination } from '@/components/pagination'
import { requireRequestContext } from '@/lib/auth'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'
import { can } from '@beaconhs/tenant'
import { riskSelectedProperty, riskPage } from '@/lib/risk-library-views'
import { filterRiskReviewSchedule, reviewScheduleMetrics } from '@/lib/risk-review-schedule'
import { listRiskAssessments } from '@/lib/risk-assessments'
import { riskRatingForAssessmentScore } from '@/lib/risk-assessment-matrix'
import { riskLifecycleStatus } from '@/lib/risk-lifecycle'
import { loadEnabledModuleKeys } from '@/lib/module-entitlements/server'
import { ScheduleReviewPicker } from './schedule-review-picker'
import { getGeneratedTranslations, getGeneratedValueTranslations } from '@/i18n/generated.server'
import { isRiskSchemaReady } from '@/lib/risk-schema-readiness'
import { RiskSchemaNotice } from '../risk-schema-notice'

type Search = Record<string, string | string[] | undefined>
const pick = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '')

function dateLabel(value: string | null) {
  if (!value) return '—'
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export default async function RiskReviewSchedulePage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const [ctx, search, translateValue, translateMessage] = await Promise.all([
    requireRequestContext(),
    searchParams,
    getGeneratedValueTranslations(),
    getGeneratedTranslations(),
  ])
  if (!(await isRiskSchemaReady(ctx))) return <RiskSchemaNotice />
  const propertyContext = await resolveHospitalityPropertyContext(ctx)
  let selectedProperty: string | null
  try {
    selectedProperty = riskSelectedProperty(search, propertyContext)
  } catch {
    notFound()
  }

  const records = await listRiskAssessments(ctx, selectedProperty ?? undefined)
  const scheduled = records.filter(
    ({ assessment }) => !['draft', 'retired'].includes(assessment.status),
  )
  const assessmentIds = scheduled.map(({ assessment }) => assessment.id)
  const [hazardScores, latestReviews] =
    assessmentIds.length === 0
      ? [new Map<string, number>(), new Map<string, Date>()]
      : await Promise.all([
          ctx.db(async (tx) => {
            const rows = await tx
              .select({
                assessmentId: riskHazards.assessmentId,
                score: sql<number>`max(${riskHazards.residualScore})`,
              })
              .from(riskHazards)
              .where(
                and(
                  eq(riskHazards.tenantId, ctx.tenantId),
                  inArray(riskHazards.assessmentId, assessmentIds),
                  isNull(riskHazards.archivedAt),
                ),
              )
              .groupBy(riskHazards.assessmentId)
            return new Map(rows.map((row) => [row.assessmentId, Number(row.score)]))
          }),
          ctx.db(async (tx) => {
            const rows = await tx
              .select({
                assessmentId: riskAssessmentSignoffs.assessmentId,
                signedAt: riskAssessmentSignoffs.signedAt,
              })
              .from(riskAssessmentSignoffs)
              .where(
                and(
                  eq(riskAssessmentSignoffs.tenantId, ctx.tenantId),
                  inArray(riskAssessmentSignoffs.assessmentId, assessmentIds),
                  inArray(riskAssessmentSignoffs.action, ['reviewed', 'amended', 're_adopted']),
                ),
              )
              .orderBy(desc(riskAssessmentSignoffs.signedAt))
            const latest = new Map<string, Date>()
            for (const row of rows)
              if (!latest.has(row.assessmentId)) latest.set(row.assessmentId, row.signedAt)
            return latest
          }),
        ])
  const rows = scheduled.map(({ assessment, property }) => {
    const status = riskLifecycleStatus({
      storedStatus: assessment.status,
      nextReviewDate: assessment.nextReviewDate,
      reminderLeadDays: assessment.reminderLeadDays,
    })
    return {
      assessmentId: assessment.id,
      reference: assessment.reference,
      title: assessment.title,
      propertyId: property.id,
      propertyName: property.name,
      category: assessment.assessmentCategory,
      status,
      nextReviewDate: assessment.nextReviewDate,
      lastReviewedAt: latestReviews.get(assessment.id) ?? null,
      searchText: `${assessment.adoptedTemplateSnapshot?.description ?? ''} ${assessment.adoptedTemplateSnapshot?.title ?? ''}`,
      assessment,
      score: hazardScores.get(assessment.id) ?? null,
    }
  })
  const metrics = reviewScheduleMetrics(rows)
  const filtered = filterRiskReviewSchedule(rows, {
    q: pick(search.q),
    property: selectedProperty ?? '',
    category: pick(search.category),
    status: pick(search.status),
    date: pick(search.date),
  })
  const page = riskPage(filtered, search)
  const responsibleIds = [
    ...new Set(
      page.rows
        .map((row) => row.assessment.responsibleTenantUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const people =
    responsibleIds.length === 0
      ? []
      : await ctx.db((tx) =>
          tx
            .select({ id: tenantUsers.id, displayName: tenantUsers.displayName, name: users.name })
            .from(tenantUsers)
            .innerJoin(users, eq(users.id, tenantUsers.userId))
            .where(
              and(eq(tenantUsers.tenantId, ctx.tenantId), inArray(tenantUsers.id, responsibleIds)),
            ),
        )
  const peopleNames = new Map(
    people.map((person) => [person.id, person.displayName || person.name]),
  )
  const canManage = can(ctx, 'hospitality.manage')
  const propertyIds = propertyContext.properties
  const enabledModules = await loadEnabledModuleKeys(ctx)

  return (
    <PageContainer>
      <nav aria-label={translateValue('Breadcrumb')} className="text-muted-foreground mb-3 text-sm">
        <Link href="/hospitality/risk" className="hover:underline">
          {translateValue('Risk Assessments')}
        </Link>
        <span aria-hidden="true"> / </span>
        {translateValue('Review Schedule')}
      </nav>
      <PageHeader
        title={translateValue('Review Schedule')}
        description={translateValue(
          'Track and manage upcoming reviews for all risk assessments. Keep your assessments up to date and maintain a safe environment.',
        )}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <ScheduleReviewPicker
                assessments={records.map(({ assessment }) => ({
                  id: assessment.id,
                  reference: assessment.reference,
                  title: assessment.title,
                }))}
              />
            )}
            {selectedProperty && enabledModules.has('hospitality.diary') ? (
              <Button asChild variant="outline">
                <Link href={`/hospitality/properties/${selectedProperty}/diary`}>
                  {translateValue('Property Diary & Tasks')}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Overdue',
            count: metrics.overdue,
            accent: 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
            icon: AlertTriangle,
            date: 'overdue',
          },
          {
            label: 'Due in 30 days',
            count: metrics.dueIn30Days,
            accent: 'bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
            icon: CalendarClock,
            date: 'next-30',
          },
          {
            label: 'Due in 31–90 days',
            count: metrics.dueIn31To90Days,
            accent: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
            icon: CalendarDays,
            date: '31-90',
          },
          {
            label: 'Recently reviewed',
            count: metrics.recentlyReviewed,
            accent: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
            icon: CheckCircle2,
            date: 'recent',
          },
        ].map(({ label, count, accent, icon: Icon, date }) => (
          <Link
            href={`/hospitality/risk/review-schedule?property=${selectedProperty ?? 'all'}&date=${date}`}
            key={label}
            className={`flex items-center gap-4 rounded-lg border p-4 ${accent}`}
          >
            <Icon className="h-7 w-7" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm">{label}</p>
              <strong className="mt-1 block text-2xl">{count}</strong>
            </div>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ))}
      </div>

      <form
        id="review-register"
        className="bg-card mt-6 flex flex-wrap items-end gap-3 rounded-lg border p-4"
        method="get"
      >
        <label className="grid gap-1 text-sm">
          {translateValue('Property')}{' '}
          <Select
            name="property"
            defaultValue={selectedProperty ?? 'all'}
            aria-label={translateValue('Filter by property')}
          >
            <option value="all">All properties</option>
            {propertyIds.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          {translateValue('Category')}{' '}
          <Select
            name="category"
            defaultValue={pick(search.category)}
            aria-label={translateValue('Filter by category')}
          >
            <option value="">All categories</option>
            {RISK_LIBRARY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          {translateValue('Status')}{' '}
          <Select
            name="status"
            defaultValue={pick(search.status)}
            aria-label={translateValue('Filter by status')}
          >
            <option value="">All statuses</option>
            {['overdue', 'review_due', 'due_soon', 'active'].map((status) => (
              <option key={status} value={status}>
                {status.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          {translateValue('Review period')}{' '}
          <Select
            name="date"
            defaultValue={pick(search.date)}
            aria-label={translateValue('Filter by review period')}
          >
            <option value="">All dates</option>
            <option value="overdue">Overdue</option>
            <option value="next-30">Due in 30 days</option>
            <option value="next-90">Due in 90 days</option>
            <option value="31-90">Due in 31–90 days</option>
            <option value="recent">Recently reviewed</option>
          </Select>
        </label>
        <label className="grid min-w-56 flex-1 gap-1 text-sm">
          {translateValue('Search')}{' '}
          <input
            name="q"
            defaultValue={pick(search.q)}
            placeholder={translateValue('Search assessment reference or title')}
            className="bg-background h-10 rounded-md border px-3 text-sm"
          />
        </label>
        <Select
          name="perPage"
          defaultValue={page.perPage}
          aria-label={translateValue('Assessments per page')}
        >
          {[10, 25, 50].map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </Select>
        <Button type="submit">{translateValue('Filter schedule')}</Button>
        <Button asChild variant="outline">
          <Link href="/hospitality/risk/review-schedule">{translateValue('Clear filters')}</Link>
        </Button>
      </form>

      {page.rows.length === 0 ? (
        <EmptyState title={translateValue('No scheduled reviews found')} />
      ) : (
        <>
          <div className="mt-5 hidden overflow-x-auto rounded-lg border lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {[
                    'Assessment',
                    'Property',
                    'Category',
                    'Risk rating',
                    'Last review',
                    'Next review',
                    'Status',
                    'Responsible person',
                    'Actions',
                  ].map((column) => (
                    <th key={column} className="px-4 py-3 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => {
                  const reviewHref = `/hospitality/risk/assessments/${row.assessmentId}#review-signoff`
                  const editHref = `/hospitality/risk/assessments/${row.assessmentId}#assessment-editor`
                  const rating =
                    row.score === null
                      ? '—'
                      : `${row.score} · ${row.assessment.matrixSnapshot ? riskRatingForAssessmentScore(row.score, row.assessment.matrixSnapshot) : 'Historical matrix unknown'}`
                  const dueLabel =
                    row.status === 'overdue'
                      ? 'Overdue'
                      : row.status === 'review_due'
                        ? 'Due today'
                        : row.status === 'due_soon'
                          ? 'Due soon'
                          : 'Upcoming'
                  return (
                    <tr key={row.assessmentId} className="border-t">
                      <td className="px-4 py-3">
                        <Link
                          className="font-medium hover:underline"
                          href={`/hospitality/risk/assessments/${row.assessmentId}`}
                        >
                          {row.reference} · {row.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{row.propertyName}</td>
                      <td className="px-4 py-3 capitalize">{row.category.replaceAll('_', ' ')}</td>
                      <td className="px-4 py-3">
                        <span className="bg-muted inline-flex rounded-full px-2 py-1 text-xs">
                          {rating}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.lastReviewedAt
                          ? dateLabel(row.lastReviewedAt.toISOString().slice(0, 10))
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {dateLabel(row.nextReviewDate)}
                        <span className="text-muted-foreground block text-xs">
                          {row.assessment.validityMonths
                            ? translateMessage('m_09bdb3c1fcc0ea', {
                                value0: row.assessment.validityMonths,
                              })
                            : translateValue('Custom review period')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs ${row.status === 'overdue' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'}`}
                        >
                          {dueLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.assessment.responsibleTenantUserId ? (
                          (peopleNames.get(row.assessment.responsibleTenantUserId) ?? '—')
                        ) : canManage ? (
                          <Link className="underline" href={editHref}>
                            {translateValue('Assign person')}
                          </Link>
                        ) : (
                          translateValue('Unassigned')
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {canManage ? (
                            <Link className="underline" href={reviewHref}>
                              {translateValue('Review')}
                            </Link>
                          ) : (
                            <Link
                              className="underline"
                              href={`/hospitality/risk/assessments/${row.assessmentId}`}
                            >
                              {translateValue('Open')}
                            </Link>
                          )}
                          {canManage && (
                            <Link className="underline" href={editHref}>
                              {translateValue('Edit')}
                            </Link>
                          )}
                          <a
                            className="underline"
                            href={`/hospitality/risk/assessments/${row.assessmentId}/pdf`}
                            download
                          >
                            {translateValue('PDF')}
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-3 lg:hidden">
            {page.rows.map((row) => (
              <article key={row.assessmentId} className="bg-card rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    className="font-semibold underline-offset-4 hover:underline"
                    href={`/hospitality/risk/assessments/${row.assessmentId}`}
                  >
                    {row.reference} · {row.title}
                  </Link>
                  <span className="rounded-full border px-2 py-1 text-xs">
                    {row.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{translateValue('Property')}</dt>
                    <dd>{row.propertyName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{translateValue('Category')}</dt>
                    <dd className="capitalize">{row.category.replaceAll('_', ' ')}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{translateValue('Next review')}</dt>
                    <dd>{dateLabel(row.nextReviewDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{translateValue('Responsible')}</dt>
                    <dd>
                      {row.assessment.responsibleTenantUserId
                        ? (peopleNames.get(row.assessment.responsibleTenantUserId) ?? '—')
                        : translateValue('Unassigned')}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  {canManage ? (
                    <Link
                      className="underline"
                      href={`/hospitality/risk/assessments/${row.assessmentId}#review-signoff`}
                    >
                      {translateValue('Review')}
                    </Link>
                  ) : (
                    <Link
                      className="underline"
                      href={`/hospitality/risk/assessments/${row.assessmentId}`}
                    >
                      {translateValue('Open')}
                    </Link>
                  )}
                  {canManage && (
                    <Link
                      className="underline"
                      href={`/hospitality/risk/assessments/${row.assessmentId}#assessment-editor`}
                    >
                      {translateValue('Edit / assign')}
                    </Link>
                  )}
                  <a
                    className="underline"
                    href={`/hospitality/risk/assessments/${row.assessmentId}/pdf`}
                    download
                  >
                    {translateValue('PDF')}
                  </a>
                </div>
              </article>
            ))}
          </div>
          <Pagination
            basePath="/hospitality/risk/review-schedule"
            currentParams={{
              ...search,
              property: selectedProperty ?? (pick(search.property) === 'all' ? 'all' : undefined),
            }}
            total={page.total}
            page={page.page}
            perPage={page.perPage}
          />
        </>
      )}
      {canManage && (
        <p className="text-muted-foreground mt-4 text-sm">
          {translateValue(
            'Assign or update the responsible person from the assessment editor. Completed reviews are recorded there as immutable sign-offs with audit history.',
          )}
        </p>
      )}
    </PageContainer>
  )
}

import Link from 'next/link'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { Button, EmptyState, PageHeader, Select } from '@beaconhs/ui'
import { riskRating, RISK_LIBRARY_CATEGORIES } from '@beaconhs/db'
import { correctiveActions, riskHazards, tenantUsers, users } from '@beaconhs/db/schema'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'
import { listRiskAssessments, listRiskTemplates } from '@/lib/risk-assessments'
import { daysUntilRiskReview, riskLifecycleStatus } from '@/lib/risk-lifecycle'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'

type Search = Record<string, string | string[] | undefined>

function value(input: string | string[] | undefined): string {
  return typeof input === 'string' ? input : ''
}

export default async function RiskLibraryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [ctx, search, translateValue] = await Promise.all([
    requireRequestContext(),
    searchParams,
    getGeneratedValueTranslations(),
  ])
  const propertyContext = await resolveHospitalityPropertyContext(ctx)
  const category = value(search.category)
  const templates = await listRiskTemplates(ctx, {
    search: value(search.q),
    category: RISK_LIBRARY_CATEGORIES.includes(category as (typeof RISK_LIBRARY_CATEGORIES)[number])
      ? (category as (typeof RISK_LIBRARY_CATEGORIES)[number])
      : undefined,
  })
  const allAssessments = await listRiskAssessments(
    ctx,
    propertyContext.activePropertyId ?? undefined,
  )
  const statusFilter = value(search.status)
  const categoryFilter = value(search.assessmentCategory)
  const dueFilter = value(search.due)
  const assessments = allAssessments.filter(({ assessment }) => {
    const status = riskLifecycleStatus({
      storedStatus: assessment.status,
      nextReviewDate: assessment.nextReviewDate,
      reminderLeadDays: assessment.reminderLeadDays,
    })
    if (statusFilter && status !== statusFilter) return false
    if (categoryFilter && assessment.adoptedTemplateSnapshot.category !== categoryFilter)
      return false
    if (dueFilter === 'due' && !['due_soon', 'review_due', 'overdue'].includes(status)) return false
    return true
  })
  const hazardScores = await ctx.db(async (tx) => {
    const ids = allAssessments.map(({ assessment }) => assessment.id)
    if (ids.length === 0) return new Map<string, number>()
    const rows = await tx
      .select({
        assessmentId: riskHazards.assessmentId,
        score: sql<number>`max(${riskHazards.residualScore})`,
      })
      .from(riskHazards)
      .where(and(eq(riskHazards.tenantId, ctx.tenantId), inArray(riskHazards.assessmentId, ids)))
      .groupBy(riskHazards.assessmentId)
    return new Map(rows.map((row) => [row.assessmentId, Number(row.score)]))
  })

  const highCriticalCount = [...hazardScores.values()].filter((score) => score >= 10).length
  const allAssessmentIds = allAssessments.map(({ assessment }) => assessment.id)
  const openCorrectiveActions =
    allAssessmentIds.length === 0
      ? 0
      : await ctx.db(async (tx) => {
          const [row] = await tx
            .select({ value: sql<number>`count(*)` })
            .from(correctiveActions)
            .innerJoin(
              riskHazards,
              and(
                eq(riskHazards.tenantId, correctiveActions.tenantId),
                eq(riskHazards.id, correctiveActions.sourceEntityId),
              ),
            )
            .where(
              and(
                eq(correctiveActions.tenantId, ctx.tenantId),
                eq(correctiveActions.sourceEntityType, 'risk_hazard'),
                inArray(riskHazards.assessmentId, allAssessmentIds),
                sql`${correctiveActions.status} NOT IN ('closed','cancelled')`,
              ),
            )
          return Number(row?.value ?? 0)
        })

  const responsibleIds = [
    ...new Set(
      assessments
        .map(({ assessment }) => assessment.responsibleTenantUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const responsiblePeople =
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
  const responsibleNames = new Map(
    responsiblePeople.map((person) => [person.id, person.displayName || person.name]),
  )
  const activeCount = allAssessments.filter(
    ({ assessment }) =>
      riskLifecycleStatus({
        storedStatus: assessment.status,
        nextReviewDate: assessment.nextReviewDate,
        reminderLeadDays: assessment.reminderLeadDays,
      }) === 'active',
  ).length
  const dueCount = allAssessments.filter(({ assessment }) =>
    ['due_soon', 'review_due'].includes(
      riskLifecycleStatus({
        storedStatus: assessment.status,
        nextReviewDate: assessment.nextReviewDate,
        reminderLeadDays: assessment.reminderLeadDays,
      }),
    ),
  ).length
  const overdueCount = allAssessments.filter(
    ({ assessment }) =>
      riskLifecycleStatus({
        storedStatus: assessment.status,
        nextReviewDate: assessment.nextReviewDate,
        reminderLeadDays: assessment.reminderLeadDays,
      }) === 'overdue',
  ).length

  return (
    <PageContainer>
      <PageHeader
        title={translateValue('Risk Library')}
        description={translateValue(
          'Adopt standard risk templates and manage assessments for the selected property.',
        )}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/hospitality/risk/export.csv">
            {translateValue('Export Risk Register CSV')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/hospitality/risk/register/pdf">
            {translateValue('Export Risk Register PDF')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/hospitality/risk/library/export.csv">
            {translateValue('Export Risk Library CSV')}
          </Link>
        </Button>
      </div>

      <form className="mt-5 flex flex-wrap gap-3 rounded-lg border p-4" method="get">
        <input
          name="q"
          defaultValue={value(search.q)}
          placeholder={translateValue('Search risk templates…')}
          className="bg-background min-w-64 flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <Select
          name="category"
          defaultValue={category}
          className="bg-background rounded-md border px-3 py-2 text-sm"
          aria-label={translateValue('Risk category')}
        >
          <option value="">{translateValue('All categories')}</option>
          {RISK_LIBRARY_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
        <Button type="submit">{translateValue('Filter')}</Button>
      </form>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{translateValue('Standard templates')}</h2>
        {templates.length === 0 ? (
          <EmptyState title={translateValue('No risk templates found')} />
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {templates.map((template) => (
              <article key={template.id} className="rounded-lg border p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-muted-foreground text-sm capitalize">
                      {template.category.replaceAll('_', ' ')}
                    </p>
                    <h3 className="font-semibold">{template.title}</h3>
                  </div>
                  <span className="rounded-full border px-2 py-0.5 text-xs">
                    {translateValue('Version')} {template.version} · {template.state}
                  </span>
                </div>
                <p className="text-muted-foreground mt-2 text-sm">{template.description}</p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href={`/hospitality/risk/templates/${template.id}`}>
                    {translateValue('View template')}
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border p-4">
          <strong>{activeCount}</strong>
          <p className="text-sm">{translateValue('Active assessments')}</p>
        </div>
        <div className="rounded-lg border p-4">
          <strong>{dueCount}</strong>
          <p className="text-sm">{translateValue('Reviews due soon')}</p>
        </div>
        <div className="rounded-lg border p-4">
          <strong>{overdueCount}</strong>
          <p className="text-sm">{translateValue('Overdue reviews')}</p>
        </div>
      </section>
      <form className="mt-6 flex flex-wrap gap-3" method="get">
        <Select name="status" defaultValue={statusFilter}>
          <option value="">{translateValue('All statuses')}</option>
          {['draft', 'active', 'due_soon', 'review_due', 'overdue', 'retired'].map((item) => (
            <option key={item} value={item}>
              {item.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
        <Select name="assessmentCategory" defaultValue={categoryFilter}>
          <option value="">{translateValue('All categories')}</option>
          {RISK_LIBRARY_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
        <Select name="due" defaultValue={dueFilter}>
          <option value="">{translateValue('All review dates')}</option>
          <option value="due">{translateValue('Due or overdue')}</option>
        </Select>
        <Button type="submit">{translateValue('Filter register')}</Button>
      </form>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{translateValue('Risk Assessments')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {propertyContext.activePropertyId
            ? translateValue('Showing the selected property.')
            : translateValue('Showing your authorised portfolio.')}
        </p>
        {assessments.length === 0 ? (
          <EmptyState title={translateValue('No risk assessments found')} />
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {[
                    'Assessment',
                    'Property',
                    'Category',
                    'Template version',
                    'Lifecycle status',
                    'Residual risk',
                    'Responsible person',
                    'Effective date',
                    'Next review',
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 font-medium">
                      {translateValue(label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assessments.map(({ assessment, property }) => {
                  const score = hazardScores.get(assessment.id)
                  return (
                    <tr key={assessment.id} className="border-t">
                      <td className="px-4 py-3">
                        <Link
                          className="font-medium underline-offset-4 hover:underline"
                          href={`/hospitality/risk/assessments/${assessment.id}`}
                        >
                          {assessment.reference} · {assessment.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{property.name}</td>
                      <td className="px-4 py-3 capitalize">
                        {assessment.adoptedTemplateSnapshot.category.replaceAll('_', ' ')}
                      </td>
                      <td className="px-4 py-3">{assessment.adoptedTemplateVersion}</td>
                      <td className="px-4 py-3 capitalize">
                        {riskLifecycleStatus({
                          storedStatus: assessment.status,
                          nextReviewDate: assessment.nextReviewDate,
                          reminderLeadDays: assessment.reminderLeadDays,
                        }).replaceAll('_', ' ')}
                      </td>
                      <td className="px-4 py-3">
                        {score ? `${score} · ${riskRating(score)}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {assessment.responsibleTenantUserId
                          ? responsibleNames.get(assessment.responsibleTenantUserId)
                          : '—'}
                      </td>
                      <td className="px-4 py-3">{assessment.effectiveDate ?? '—'}</td>
                      <td className="px-4 py-3">
                        {assessment.nextReviewDate ?? '—'}{' '}
                        {assessment.nextReviewDate ? (
                          <span>
                            ({daysUntilRiskReview(assessment.nextReviewDate)}{' '}
                            {translateValue('days')})
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageContainer>
  )
}

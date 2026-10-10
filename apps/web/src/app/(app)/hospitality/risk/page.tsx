import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can } from '@beaconhs/tenant'
import { Pagination } from '@/components/pagination'
import {
  riskAssessmentTemplateVersion,
  riskPage,
  riskSelectedProperty,
  riskView,
} from '@/lib/risk-library-views'
import { RiskViewTabs } from './risk-view-tabs'
import { CreateManualAssessment } from './create-manual-assessment'
import { captureRiskMatrix } from '@/lib/risk-revisions'
import { AvailableTemplates } from './available-templates'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Button, EmptyState, PageHeader, Select } from '@beaconhs/ui'
import { RISK_LIBRARY_CATEGORIES } from '@beaconhs/db'
import {
  isHighOrCriticalRiskScore,
  riskRatingForAssessmentScore,
} from '@/lib/risk-assessment-matrix'
import { correctiveActions, riskHazards, tenantUsers, tenants, users } from '@beaconhs/db/schema'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'
import { listRiskAssessments } from '@/lib/risk-assessments'
import { daysUntilRiskReview, riskLifecycleStatus } from '@/lib/risk-lifecycle'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { isRiskSchemaReady } from '@/lib/risk-schema-readiness'
import { RiskSchemaNotice } from './risk-schema-notice'

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
  if (!(await isRiskSchemaReady(ctx))) return <RiskSchemaNotice />
  const propertyContext = await resolveHospitalityPropertyContext(ctx)
  const view = riskView(search)
  if (view === 'templates') return <AvailableTemplates ctx={ctx} search={search} />
  let selectedProperty: string | null
  try {
    selectedProperty = riskSelectedProperty(search, propertyContext)
  } catch {
    notFound()
  }
  const [allAssessments, tenantRiskMatrix] = await Promise.all([
    selectedProperty ? listRiskAssessments(ctx, selectedProperty) : Promise.resolve([]),
    ctx.db(async (tx) => {
      const [tenant] = await tx
        .select({ riskMatrix: tenants.riskMatrix })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1)
      return tenant?.riskMatrix ?? null
    }),
  ])
  const canManage = can(ctx, 'hospitality.manage')
  const canExport = can(ctx, 'admin.data.export')
  const statusFilter = value(search.status)
  const categoryFilter = value(search.assessmentCategory)
  const dueFilter = value(search.due)
  const matchingAssessments = allAssessments.filter(({ assessment }) => {
    const status = riskLifecycleStatus({
      storedStatus: assessment.status,
      nextReviewDate: assessment.nextReviewDate,
      reminderLeadDays: assessment.reminderLeadDays,
    })
    const query = value(search.q).trim().toLowerCase()
    if (query && !`${assessment.reference} ${assessment.title}`.toLowerCase().includes(query))
      return false
    if (statusFilter && status !== statusFilter) return false
    if (categoryFilter && assessment.assessmentCategory !== categoryFilter) return false
    if (dueFilter === 'due' && !['due_soon', 'review_due', 'overdue'].includes(status)) return false
    return true
  })
  const page = riskPage(matchingAssessments, search)
  const assessments = page.rows
  const hazardScores = await ctx.db(async (tx) => {
    const ids = allAssessments.map(({ assessment }) => assessment.id)
    if (ids.length === 0) return new Map<string, number>()
    const rows = await tx
      .select({
        assessmentId: riskHazards.assessmentId,
        score: sql<number>`max(${riskHazards.residualScore})`,
      })
      .from(riskHazards)
      .where(
        and(
          eq(riskHazards.tenantId, ctx.tenantId),
          inArray(riskHazards.assessmentId, ids),
          isNull(riskHazards.archivedAt),
        ),
      )
      .groupBy(riskHazards.assessmentId)
    return new Map(rows.map((row) => [row.assessmentId, Number(row.score)]))
  })

  const highCriticalCount = allAssessments.filter(
    ({ assessment }) =>
      assessment.matrixSnapshot &&
      hazardScores.has(assessment.id) &&
      isHighOrCriticalRiskScore(hazardScores.get(assessment.id)!, assessment.matrixSnapshot),
  ).length
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
        title={translateValue('Risk Assessments')}
        description={translateValue(
          'Manage assessments created or adopted for the selected property.',
        )}
      />

      <RiskViewTabs search={search} view="assessments" />
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <Button asChild>
          <Link
            href={`/hospitality/risk?view=templates${selectedProperty ? `&property=${selectedProperty}` : ''}`}
          >
            {translateValue('Create assessment from a template')}
          </Link>
        </Button>
        {canManage && (
          <CreateManualAssessment
            properties={propertyContext.properties}
            propertyId={selectedProperty}
            matrix={captureRiskMatrix(tenantRiskMatrix)}
          />
        )}
      </div>
      {selectedProperty && canExport && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a
              href={`/hospitality/risk/export.csv${selectedProperty ? `?property=${selectedProperty}` : ''}`}
              download="risk-register.csv"
            >
              {translateValue('Export Risk Register CSV')}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`/hospitality/risk/register/pdf${selectedProperty ? `?property=${selectedProperty}` : ''}`}
              download="risk-register.pdf"
            >
              {translateValue('Export Risk Register PDF')}
            </a>
          </Button>
        </div>
      )}

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border p-4">
          <strong>{highCriticalCount}</strong>
          <p className="text-sm">{translateValue('High / critical residual risks')}</p>
        </div>
        <div className="rounded-lg border p-4">
          <strong>{openCorrectiveActions}</strong>
          <p className="text-sm">{translateValue('Open corrective actions')}</p>
        </div>
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
        <input type="hidden" name="view" value="assessments" />
        <Select
          name="property"
          defaultValue={selectedProperty ?? ''}
          aria-label={translateValue('Assessment property')}
        >
          <option value="">Choose a property</option>
          {propertyContext.properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </Select>
        <input
          name="q"
          defaultValue={value(search.q)}
          aria-label={translateValue('Search assessments')}
          placeholder={translateValue('Search reference or title')}
          className="bg-background min-w-64 rounded-md border px-3 py-2 text-sm"
        />
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
        <Button type="submit">{translateValue('Filter register')}</Button>
      </form>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{translateValue('Property Risk Assessments')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {selectedProperty
            ? translateValue('Showing the selected property.')
            : translateValue('Choose a property to view its assessments.')}
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
                    'Actions',
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
                        {assessment.assessmentCategory.replaceAll('_', ' ')}
                      </td>
                      <td className="px-4 py-3">
                        {riskAssessmentTemplateVersion(assessment.adoptedTemplateSnapshot)}
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {riskLifecycleStatus({
                          storedStatus: assessment.status,
                          nextReviewDate: assessment.nextReviewDate,
                          reminderLeadDays: assessment.reminderLeadDays,
                        }).replaceAll('_', ' ')}
                      </td>
                      <td className="px-4 py-3">
                        {score
                          ? `${score} · ${assessment.matrixSnapshot ? riskRatingForAssessmentScore(score, assessment.matrixSnapshot) : 'Historical matrix unknown'}`
                          : '—'}
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
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="underline"
                            href={`/hospitality/risk/assessments/${assessment.id}`}
                          >
                            {translateValue('Open / Review / Actions')}
                          </Link>
                          {canManage && (
                            <Link
                              className="underline"
                              href={`/hospitality/risk/assessments/${assessment.id}#assessment-editor`}
                            >
                              {translateValue('Edit')}
                            </Link>
                          )}
                          <a
                            className="underline"
                            href={`/hospitality/risk/assessments/${assessment.id}/pdf`}
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
        )}
        <Pagination
          basePath="/hospitality/risk"
          currentParams={{
            ...search,
            view: 'assessments',
            property: selectedProperty ?? undefined,
          }}
          total={page.total}
          page={page.page}
          perPage={page.perPage}
        />
      </section>
    </PageContainer>
  )
}

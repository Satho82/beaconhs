import Link from 'next/link'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { Button, EmptyState, PageHeader, Select } from '@beaconhs/ui'
import { riskRating, RISK_LIBRARY_CATEGORIES } from '@beaconhs/db'
import { riskHazards } from '@beaconhs/db/schema'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'
import { listRiskAssessments, listRiskTemplates } from '@/lib/risk-assessments'
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
  const assessments = await listRiskAssessments(ctx, propertyContext.activePropertyId ?? undefined)
  const hazardScores = await ctx.db(async (tx) => {
    const ids = assessments.map(({ assessment }) => assessment.id)
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

  return (
    <PageContainer>
      <PageHeader
        title={translateValue('Risk Library')}
        description={translateValue(
          'Adopt standard risk templates and manage assessments for the selected property.',
        )}
      />

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
                    'Template version',
                    'Status',
                    'Residual risk',
                    'Date',
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
                      <td className="px-4 py-3">{assessment.adoptedTemplateVersion}</td>
                      <td className="px-4 py-3 capitalize">{assessment.status}</td>
                      <td className="px-4 py-3">
                        {score ? `${score} · ${riskRating(score)}` : '—'}
                      </td>
                      <td className="px-4 py-3">{assessment.assessmentDate}</td>
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

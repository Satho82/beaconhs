import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, asc, eq } from 'drizzle-orm'
import { Button, PageHeader } from '@beaconhs/ui'
import { tenantUsers, users } from '@beaconhs/db/schema'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { getRiskAssessment } from '@/lib/risk-assessments'
import { getNewerRiskTemplate, listRiskSignoffs, riskLifecycleStatus } from '@/lib/risk-lifecycle'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { AssessmentEditor } from './assessment-editor'
import { RiskLifecyclePanel } from './lifecycle-panel'

export default async function RiskAssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>
}) {
  const { assessmentId } = await params
  if (!isUuid(assessmentId)) notFound()
  const [ctx, translateValue] = await Promise.all([
    requireRequestContext(),
    getGeneratedValueTranslations(),
  ])
  const record = await getRiskAssessment(ctx, assessmentId)
  if (!record) notFound()

  const [signoffs, newerTemplate] = await Promise.all([
    listRiskSignoffs(ctx, assessmentId),
    getNewerRiskTemplate(ctx, record.assessment),
  ])
  const lifecycleStatus = riskLifecycleStatus({
    storedStatus: record.assessment.status,
    nextReviewDate: record.assessment.nextReviewDate,
    reminderLeadDays: record.assessment.reminderLeadDays,
  })

  const description = [
    record.assessment.reference,
    record.property.name,
    `${translateValue('Template')} ${record.assessment.adoptedTemplateVersion}`,
  ].join(' · ')

  const people = await ctx.db((tx) =>
    tx
      .select({
        id: tenantUsers.id,
        displayName: tenantUsers.displayName,
        name: users.name,
      })
      .from(tenantUsers)
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(and(eq(tenantUsers.tenantId, ctx.tenantId), eq(tenantUsers.status, 'active')))
      .orderBy(asc(tenantUsers.displayName), asc(users.name)),
  )

  return (
    <PageContainer>
      <div className="mb-3 flex gap-2">
        <Button asChild variant="ghost">
          <Link href="/hospitality/risk">{translateValue('Back to Risk Library')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/hospitality/risk/assessments/${assessmentId}/pdf`}>
            {translateValue('Print / PDF')}
          </Link>
        </Button>
      </div>
      <PageHeader title={record.assessment.title} description={description} />
      {newerTemplate && (
        <div className="mt-6 rounded-lg border border-amber-500 p-4 font-medium">
          {translateValue('New template version available')}: {newerTemplate.version}
        </div>
      )}
      <div className="mt-6 space-y-6">
        <RiskLifecyclePanel
          assessmentId={record.assessment.id}
          status={lifecycleStatus}
          effectiveDate={record.assessment.effectiveDate}
          nextReviewDate={record.assessment.nextReviewDate}
          reminderLeadDays={record.assessment.reminderLeadDays}
        />
        <AssessmentEditor
          assessment={record.assessment}
          hazards={record.hazards}
          people={people.map((person) => ({
            id: person.id,
            name: person.displayName || person.name,
          }))}
        />
        {signoffs.length > 0 && (
          <section className="rounded-lg border p-5">
            <h2 className="font-semibold">{translateValue('Sign-off history')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {signoffs.map((signoff) => (
                <li key={signoff.id} className="border-t pt-2 first:border-0">
                  {signoff.action.replaceAll('_', ' ')} · {signoff.signedByName} ·{' '}
                  {signoff.signedByRole} · {signoff.signedAt.toISOString()} ·{' '}
                  {translateValue('Version')} {signoff.lifecycleVersion}
                  {signoff.snapshot && (
                    <>
                      {' · '}
                      <Link
                        className="underline"
                        href={`/hospitality/risk/assessments/${assessmentId}/pdf?signoffId=${signoff.id}`}
                      >
                        {translateValue('PDF')}
                      </Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageContainer>
  )
}

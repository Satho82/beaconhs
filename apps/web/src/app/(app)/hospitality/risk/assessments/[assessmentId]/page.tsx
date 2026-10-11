import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, asc, eq } from 'drizzle-orm'
import { Button, PageHeader } from '@beaconhs/ui'
import { tenantUsers, tenants, users } from '@beaconhs/db/schema'
import { assignedPropertyIds, can } from '@beaconhs/tenant'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { riskAssessmentTemplateVersion } from '@/lib/risk-library-views'
import { isUuid } from '@/lib/list-params'
import { getRiskAssessment } from '@/lib/risk-assessments'
import { getNewerRiskTemplate, listRiskSignoffs, riskLifecycleStatus } from '@/lib/risk-lifecycle'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { AssessmentEditor } from './assessment-editor'
import { RiskLifecyclePanel } from './lifecycle-panel'
import { SaveTenantTemplate } from '../../save-tenant-template'
import { RevisionControls } from './revision-controls'
import { captureRiskMatrix } from '@/lib/risk-revisions'
import { isRiskSchemaReady } from '@/lib/risk-schema-readiness'
import { RiskSchemaNotice } from '../../risk-schema-notice'

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
  if (!(await isRiskSchemaReady(ctx))) return <RiskSchemaNotice />
  const [record, tenantRiskMatrix] = await Promise.all([
    getRiskAssessment(ctx, assessmentId),
    ctx.db(async (tx) => {
      const [tenant] = await tx
        .select({ riskMatrix: tenants.riskMatrix })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1)
      return tenant?.riskMatrix ?? null
    }),
  ])
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
    `${translateValue('Template')} ${riskAssessmentTemplateVersion(record.assessment.adoptedTemplateSnapshot)}`,
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
          <Link
            href={`/hospitality/risk?view=assessments&property=${record.assessment.propertyId}`}
          >
            {translateValue('Back to Property Risk Assessments')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <a href={`/hospitality/risk/assessments/${assessmentId}/pdf`} download>
            {translateValue('Print / PDF')}
          </a>
        </Button>
      </div>
      <PageHeader title={record.assessment.title} description={description} />
      {newerTemplate && (
        <div className="mt-6 rounded-lg border border-amber-500 p-4 font-medium">
          {translateValue('New template version available')}: {newerTemplate.version}
        </div>
      )}
      <div className="mt-6 space-y-6">
        {can(ctx, 'hospitality.manage') && record.assessment.matrixSnapshot && (
          <RiskLifecyclePanel
            contentRevision={record.assessment.contentRevision}
            assessmentId={record.assessment.id}
            status={lifecycleStatus}
            effectiveDate={record.assessment.effectiveDate}
            nextReviewDate={record.assessment.nextReviewDate}
            reminderLeadDays={record.assessment.reminderLeadDays}
          />
        )}
        {can(ctx, 'hospitality.manage') && (
          <RevisionControls
            assessmentId={assessmentId}
            revision={record.assessment.contentRevision}
            matrix={captureRiskMatrix(tenantRiskMatrix)}
            unknownMatrix={!record.assessment.matrixSnapshot}
            hazards={record.hazards}
          />
        )}
        {record.assessment.matrixSnapshot && (
          <AssessmentEditor
            canEdit={can(ctx, 'hospitality.manage') && record.assessment.status !== 'retired'}
            key={record.assessment.contentRevision}
            assessment={record.assessment}
            hazards={record.hazards.filter((hazard) => !hazard.archivedAt)}
            matrix={record.assessment.matrixSnapshot}
            people={people.map((person) => ({
              id: person.id,
              name: person.displayName || person.name,
            }))}
          />
        )}
        {!record.assessment.matrixSnapshot && (
          <section className="space-y-3 rounded-lg border p-5">
            <h2 className="font-semibold">{translateValue('Historical matrix unknown')}</h2>
            <p>
              {translateValue(
                'Recorded numeric scores are preserved. Their original rating bands were not captured.',
              )}
            </p>
            {record.hazards.map((hazard) => (
              <article key={hazard.id} className="border-t pt-3">
                <h3 className="font-medium">{hazard.hazardDescription}</h3>
                <p>{hazard.harmDescription}</p>
                <p>{hazard.controls}</p>
                <p>
                  {translateValue('Initial score:')} {hazard.initialScore}{' '}
                  {translateValue('· Residual score:')} {hazard.residualScore}
                </p>
              </article>
            ))}
          </section>
        )}
        {can(ctx, 'hospitality.manage') && assignedPropertyIds(ctx) === null && (
          <SaveTenantTemplate
            source={{ kind: 'assessment', id: record.assessment.id }}
            title={record.assessment.title}
            description={record.assessment.adoptedTemplateSnapshot?.description ?? ''}
          />
        )}
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
                      <a
                        className="underline"
                        href={`/hospitality/risk/assessments/${assessmentId}/pdf?signoffId=${signoff.id}`}
                        download
                      >
                        {translateValue('PDF')}
                      </a>
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

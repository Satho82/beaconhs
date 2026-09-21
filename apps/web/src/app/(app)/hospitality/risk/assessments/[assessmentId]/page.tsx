import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, asc, eq } from 'drizzle-orm'
import { Button, PageHeader } from '@beaconhs/ui'
import { tenantUsers, users } from '@beaconhs/db/schema'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { getRiskAssessment } from '@/lib/risk-assessments'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { AssessmentEditor } from './assessment-editor'

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
      <Button asChild variant="ghost" className="mb-3">
        <Link href="/hospitality/risk">{translateValue('Back to Risk Library')}</Link>
      </Button>
      <PageHeader title={record.assessment.title} description={description} />
      <div className="mt-6">
        <AssessmentEditor
          assessment={record.assessment}
          hazards={record.hazards}
          people={people.map((person) => ({
            id: person.id,
            name: person.displayName || person.name,
          }))}
        />
      </div>
    </PageContainer>
  )
}

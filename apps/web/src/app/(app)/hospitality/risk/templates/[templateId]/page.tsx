import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button, PageHeader } from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'
import { getRiskTemplate } from '@/lib/risk-assessments'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { AdoptionPanel } from './adoption-panel'

export default async function RiskTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  if (!isUuid(templateId)) notFound()
  const [ctx, translateValue] = await Promise.all([
    requireRequestContext(),
    getGeneratedValueTranslations(),
  ])
  const [template, propertyContext] = await Promise.all([
    getRiskTemplate(ctx, templateId),
    resolveHospitalityPropertyContext(ctx),
  ])
  if (!template) notFound()
  const description = [
    template.category.replaceAll('_', ' '),
    `v${template.version}`,
    template.state,
  ].join(' · ')

  return (
    <PageContainer>
      <Button asChild variant="ghost" className="mb-3">
        <Link href="/hospitality/risk">{translateValue('Back to Risk Library')}</Link>
      </Button>
      <PageHeader title={template.title} description={description} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="rounded-lg border p-5">
            <h2 className="font-semibold">{translateValue('Template guidance')}</h2>
            <p className="mt-2">{template.description}</p>
            <dl className="mt-4 grid gap-4 text-sm">
              <div>
                <dt className="font-medium">{translateValue('Area / location')}</dt>
                <dd className="text-muted-foreground">{template.areaGuidance}</dd>
              </div>
              <div>
                <dt className="font-medium">{translateValue('Activity / equipment')}</dt>
                <dd className="text-muted-foreground">{template.activityEquipmentGuidance}</dd>
              </div>
              <div>
                <dt className="font-medium">{translateValue('People at risk')}</dt>
                <dd className="text-muted-foreground">
                  {template.peopleAtRiskGuidance.join(', ')}
                </dd>
              </div>
              <div>
                <dt className="font-medium">{translateValue('Review guidance')}</dt>
                <dd className="text-muted-foreground">{template.reviewGuidance}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{translateValue('Hazards and controls')}</h2>
            <div className="mt-3 grid gap-4">
              {template.hazards.map((hazard, index) => (
                <article key={hazard.hazard} className="rounded-lg border p-5">
                  <h3 className="font-semibold">
                    {index + 1}. {hazard.hazard}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-sm">{hazard.harm}</p>
                  <p className="mt-3 text-sm">
                    <strong>{translateValue('People at risk')}:</strong>{' '}
                    {hazard.peopleAtRisk.join(', ')}
                  </p>
                  <h4 className="mt-3 text-sm font-medium">
                    {translateValue('Recommended controls')}
                  </h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {hazard.standardControls.map((control) => (
                      <li key={control}>{control}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </div>
        <AdoptionPanel
          templateId={template.id}
          templateTitle={template.title}
          activePropertyId={propertyContext.activePropertyId}
          properties={propertyContext.properties}
        />
      </div>
    </PageContainer>
  )
}

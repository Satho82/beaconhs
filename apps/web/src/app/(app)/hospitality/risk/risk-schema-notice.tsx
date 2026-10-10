import { PageHeader } from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'

export async function RiskSchemaNotice() {
  const translateValue = await getGeneratedValueTranslations()
  return (
    <PageContainer>
      <PageHeader title={translateValue('Risk Assessments')} />
      <p role="status" className="mt-4 rounded-lg border p-4">
        {translateValue(
          'Risk Assessments are temporarily unavailable until the approved database upgrade is completed.',
        )}
      </p>
    </PageContainer>
  )
}

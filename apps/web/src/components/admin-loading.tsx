import { Skeleton } from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'

export async function AdminLoading() {
  const t = await getGeneratedValueTranslations()
  return (
    <PageContainer>
      <div role="status" aria-busy="true" aria-label={t('Loading…')} className="space-y-5">
        <span className="sr-only">{t('Loading…')}</span>
        <div aria-hidden="true" className="space-y-5">
          <Skeleton className="h-8 w-3/5 max-w-sm" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </PageContainer>
  )
}

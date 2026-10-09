import { requireRequestContext } from '@/lib/auth'
import { PropertyImportSteps } from '@/components/property-import-steps'
import { can } from '@beaconhs/tenant'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { isUuid } from '@/lib/list-params'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@beaconhs/ui'
import { SettingsNavigation } from '../../../../settings-form'
import { getPropertyStructureReview } from '@/lib/imports/property-structure-confirm'
import { ConfirmImportButton } from './confirm-button'

export default async function PropertyStructureReviewPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
  if (!isUuid(batchId)) notFound()
  const ctx = await requireRequestContext()
  const review = await getPropertyStructureReview(batchId)
  if (!review) notFound()
  const t = await getTranslations('TenantSettings')
  const summary = [
    [t('previewTotalRows'), review.summary.total],
    [t('previewValid'), review.summary.valid],
    [t('previewErrors'), review.summary.errors],
    [t('previewWarnings'), review.summary.warnings],
    [t('previewDuplicates'), review.summary.duplicates],
  ] as const
  const impact = [
    [t('previewProperties'), review.hierarchy.propertiesToCreate],
    [t('previewBuildings'), review.hierarchy.buildingsToCreate],
    [t('previewFloors'), review.hierarchy.floorsToCreate],
    [t('previewRooms'), review.hierarchy.roomsToCreate],
    [t('previewRoomTypes'), review.hierarchy.roomTypesToReference],
  ] as const
  return (
    <main className="space-y-6">
      <PropertyImportSteps current="Review" />
      <SettingsNavigation
        canManageIntegrations={can(ctx, 'admin.integrations.manage')}
        navigationLabel={t('title')}
        activeSection="importExport"
      />
      <header className="space-y-2">
        <p className="text-sm text-blue-700">{t('importExport')}</p>
        <h1 className="text-3xl font-bold text-slate-950">{t('reviewImportTitle')}</h1>
        <p className="text-slate-600">{t('reviewImportDescription')}</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t('reviewImportDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <p>
            <span className="font-medium">{t('reviewSourceFile')}:</span>{' '}
            {review.batch.sourceFilename ?? t('reviewSourceUnavailable')}
          </p>
          <p>
            <span className="font-medium">{t('reviewBatchReference')}:</span> {review.batch.id}
          </p>
          <p>
            <span className="font-medium">{t('reviewDataset')}:</span> {t('propertyStructure')}
          </p>
        </CardContent>
      </Card>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {summary.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-sm text-slate-600">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>{t('previewHierarchyImpact')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {impact.map(([label, value]) => (
            <div key={label}>
              <p className="text-sm text-slate-600">{label}</p>
              <p className="text-lg font-semibold">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      {review.summary.warnings ? (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          {t('reviewWarningsRemain')}
        </div>
      ) : null}
      {review.eligible ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('reviewConfirmTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfirmImportButton
              batchId={batchId}
              label={t('reviewConfirmAction')}
              acknowledgement={t('reviewAcknowledgement')}
              failure={t('reviewFailure')}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {t('reviewNotEligible')}
        </div>
      )}
      <Button asChild variant="outline">
        <Link href={`/admin/settings/import-export/property-structure/preview/${batchId}`}>
          <ArrowLeft />
          {t('reviewBackToPreview')}
        </Link>
      </Button>
    </main>
  )
}

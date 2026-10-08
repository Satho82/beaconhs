import { requireRequestContext } from '@/lib/auth'
import { PropertyImportSteps } from '@/components/property-import-steps'
import { can } from '@beaconhs/tenant'
import Link from 'next/link'
import { CheckCircle2, Download, FileWarning, History, Upload } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { isUuid } from '@/lib/list-params'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@beaconhs/ui'
import { SettingsNavigation } from '../../../../settings-form'
import { getPropertyStructureResult } from '@/lib/imports/property-structure-result'

export default async function PropertyStructureResultPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const ctx = await requireRequestContext()
  const { batchId } = await params
  if (!isUuid(batchId)) notFound()
  const result = await getPropertyStructureResult(batchId)
  if (!result) notFound()
  const t = await getTranslations('TenantSettings')
  const completed = result.batch.status === 'completed'
  const metrics = [
    [t('resultCreated'), result.metrics.created],
    [t('resultUpdated'), result.metrics.updated],
    [t('resultRejected'), result.metrics.rejected],
    [t('previewWarnings'), result.metrics.warnings],
    [t('previewDuplicates'), result.metrics.duplicates],
    [t('resultSkipped'), result.metrics.skipped],
    [t('resultFailed'), result.metrics.failed],
  ] as const
  return (
    <main className="space-y-6">
      <PropertyImportSteps current="Result" />
      <SettingsNavigation
        canManageIntegrations={can(ctx, 'admin.integrations.manage')}
        navigationLabel={t('title')}
        activeSection="importExport"
      />
      <header className="space-y-2">
        <p className="text-sm text-blue-700">{t('importExport')}</p>
        <h1 className="text-3xl font-bold text-slate-950">{t('resultTitle')}</h1>
        <p className="text-slate-600">
          {completed ? t('resultCompletedDescription') : t('resultFailedDescription')}
        </p>
      </header>
      <div
        className={`flex gap-2 rounded-md border p-4 text-sm ${completed ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'}`}
      >
        {completed ? <CheckCircle2 className="h-5 w-5" /> : <FileWarning className="h-5 w-5" />}
        {completed ? t('resultCompleted') : t('resultFailedStatus')}
      </div>
      {!completed && result.batch.failureReason ? (
        <p className="text-sm text-slate-700">{t('resultFailureSafeMessage')}</p>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
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
          <CardTitle>{t('resultBatchDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            {t('reviewBatchReference')}: {result.batch.id}
          </p>
          <p>
            {t('reviewDataset')}: {t('propertyStructure')}
          </p>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link
            href={`/admin/settings/import-export/property-structure/result/${batchId}/download`}
          >
            <Download />
            {t('resultDownload')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/audit">
            <History />
            {t('resultAudit')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/settings/import-export/property-structure/upload">
            <Upload />
            {t('resultNewImport')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/settings/import-export">{t('resultBack')}</Link>
        </Button>
      </div>
    </main>
  )
}

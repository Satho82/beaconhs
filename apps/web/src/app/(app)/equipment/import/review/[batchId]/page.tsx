import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@beaconhs/ui'
import { getAssetImportReview } from '@/lib/imports/assets-import-confirm'
import { ConfirmAssetImportButton } from './confirm-button'

export default async function AssetImportReviewPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const tGeneratedValue = await getGeneratedValueTranslations()

  const { batchId } = await params
  if (!isUuid(batchId)) notFound()
  const review = await getAssetImportReview(batchId)
  if (!review) notFound()
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{tGeneratedValue('Review assets import')}</h1>
        <p className="mt-2 text-slate-600">
          {review.rows.length} {tGeneratedValue('rows ·')}
          {review.errors}{' '}
          {tGeneratedValue(
            'rows with errors. Duplicates are skipped; existing assets are never changed.',
          )}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">{tGeneratedValue('Row')}</th>
              <th className="p-3">{tGeneratedValue('Asset tag')}</th>
              <th className="p-3">{tGeneratedValue('Name')}</th>
              <th className="p-3">{tGeneratedValue('Result')}</th>
            </tr>
          </thead>
          <tbody>
            {review.rows.map((row) => {
              const values = row.rawValues as Record<string, string>
              return (
                <tr key={row.id} className="border-t">
                  <td className="p-3">{row.sourceRowNumber}</td>
                  <td className="p-3">{values.asset_tag}</td>
                  <td className="p-3">{values.name}</td>
                  <td className="p-3">
                    {row.issues.map((issue) => issue.message).join(' ') ||
                      (row.proposedAction === 'skip'
                        ? tGeneratedValue('Existing asset: will be skipped')
                        : tGeneratedValue('Ready to create'))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {review.eligible ? (
        <ConfirmAssetImportButton batchId={batchId} />
      ) : (
        <Button asChild variant="outline">
          <Link href="/equipment/import">{tGeneratedValue('Upload a corrected file')}</Link>
        </Button>
      )}
    </main>
  )
}

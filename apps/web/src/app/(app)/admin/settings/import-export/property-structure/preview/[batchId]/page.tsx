import { requireRequestContext } from '@/lib/auth'
import { PropertyImportSteps } from '@/components/property-import-steps'
import { can } from '@beaconhs/tenant'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, FileWarning, Upload } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { isUuid, parseListParams, pickString } from '@/lib/list-params'
import { SearchInput } from '@/components/search-input'
import { Pagination } from '@/components/pagination'
import { FilterChips } from '@/components/filter-bar'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@beaconhs/ui'
import { SettingsNavigation } from '../../../../settings-form'
import {
  getPropertyStructurePreview,
  type PreviewFilter,
} from '@/lib/imports/property-structure-preview'

const FILTERS: readonly PreviewFilter[] = ['all', 'valid', 'errors', 'warnings', 'duplicates']

function filterFrom(value: string | undefined): PreviewFilter {
  return value === 'valid' || value === 'errors' || value === 'warnings' || value === 'duplicates'
    ? value
    : 'all'
}

export default async function PropertyStructurePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { batchId } = await params
  if (!isUuid(batchId)) notFound()
  const ctx = await requireRequestContext()
  const sp = await searchParams
  const filter = filterFrom(pickString(sp.filter))
  const list = parseListParams(sp, { sort: 'row', dir: 'asc', perPage: 25, allowedSorts: ['row'] })
  const query = (list.q ?? '').trim().toLowerCase()
  const recordType = pickString(sp.recordType)
  const basePath = `/admin/settings/import-export/property-structure/preview/${batchId}`
  const filterHref = (value: string) => {
    const search = new URLSearchParams({ filter: value })
    if (query) search.set('q', query)
    if (recordType) search.set('recordType', recordType)
    return `${basePath}?${search}`
  }
  const preview = await getPropertyStructurePreview(batchId, filter)
  if (!preview) notFound()
  const filteredRows = preview.rows.filter(
    (row) =>
      (!recordType || row.recordType === recordType) &&
      (!query ||
        [
          row.sourceRowNumber,
          row.reference,
          row.name,
          ...row.messages.map((message) => message.message),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)),
  )
  const page = Math.min(list.page, Math.max(1, Math.ceil(filteredRows.length / list.perPage)))
  const rows = filteredRows.slice((page - 1) * list.perPage, page * list.perPage)
  const tBatch = await getTranslations('Generated')
  const t = await getTranslations('TenantSettings')
  const filterLabel: Record<PreviewFilter, string> = {
    all: t('previewAllRows'),
    valid: t('previewValid'),
    errors: t('previewErrors'),
    warnings: t('previewWarnings'),
    duplicates: t('previewDuplicates'),
  }
  const summary = [
    [t('previewTotalRows'), preview.summary.total],
    [t('previewValid'), preview.summary.valid],
    [t('previewErrors'), preview.summary.errors],
    [t('previewWarnings'), preview.summary.warnings],
    [t('previewDuplicates'), preview.summary.duplicates],
  ] as const
  const impact = [
    [t('previewProperties'), preview.hierarchy.propertiesToCreate],
    [t('previewBuildings'), preview.hierarchy.buildingsToCreate],
    [t('previewFloors'), preview.hierarchy.floorsToCreate],
    [t('previewRooms'), preview.hierarchy.roomsToCreate],
    [t('previewRoomTypes'), preview.hierarchy.roomTypesToReference],
  ] as const

  return (
    <main className="space-y-6">
      <PropertyImportSteps current="Preview" />
      <SettingsNavigation
        canManageIntegrations={can(ctx, 'admin.integrations.manage')}
        navigationLabel={t('title')}
        activeSection="importExport"
      />
      <header className="space-y-2">
        <p className="text-sm text-blue-700">{t('importExport')}</p>
        <h1 className="text-3xl font-bold text-slate-950">{t('previewValidationTitle')}</h1>
        <p className="text-slate-600">{t('previewValidationDescription')}</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {summary.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-sm text-slate-600">{label}</p>
              <p className="text-2xl font-semibold text-slate-950">{value}</p>
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
              <p className="text-lg font-semibold text-slate-950">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('previewRowResults')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <nav className="flex flex-wrap gap-2" aria-label={t('previewFilterRows')}>
            {FILTERS.map((candidate) => (
              <Button
                key={candidate}
                asChild
                variant={candidate === filter ? 'default' : 'outline'}
                size="sm"
              >
                <Link href={filterHref(candidate) as never}>{filterLabel[candidate]}</Link>
              </Button>
            ))}
          </nav>
          <SearchInput placeholder={tBatch('m_19dbb91f9413e1')} />
          <FilterChips
            basePath={basePath}
            currentParams={sp}
            paramKey="recordType"
            label={tBatch('m_00fe940fdc8bf4')}
            options={['Property', 'Building', 'Floor', 'Room'].map((value) => ({
              value,
              label: value,
            }))}
          />
          {rows.length === 0 ? (
            <p className="text-sm text-slate-600">{t('previewNoRows')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-slate-600">
                  <tr>
                    <th className="p-2">{t('previewRow')}</th>
                    <th className="p-2">{t('previewRecord')}</th>
                    <th className="p-2">{t('previewAction')}</th>
                    <th className="p-2">{t('previewStatus')}</th>
                    <th className="p-2">{t('previewMessage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.sourceRowNumber} className="border-b align-top">
                      <td className="p-2">{row.sourceRowNumber}</td>
                      <td className="p-2">
                        <span className="font-medium">
                          {row.recordType}: {row.reference}
                        </span>
                        <br />
                        <span className="text-slate-600">{row.name}</span>
                      </td>
                      <td className="p-2">{row.proposedAction}</td>
                      <td className="p-2">{row.status}</td>
                      <td className="p-2">
                        {row.messages.map((message, index) => (
                          <p key={`${row.sourceRowNumber}-${index}`}>
                            <span className="font-medium">
                              {message.severity === 'error'
                                ? t('previewError')
                                : t('previewWarning')}
                              :
                            </span>{' '}
                            {message.message}
                          </p>
                        ))}
                        {row.duplicateReference ? (
                          <p>
                            <span className="font-medium">{t('previewDuplicate')}:</span>{' '}
                            {row.duplicateReference}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            basePath={basePath}
            currentParams={sp}
            total={filteredRows.length}
            page={page}
            perPage={list.perPage}
          />
        </CardContent>
      </Card>
      {preview.eligibleForReview ? (
        <Button asChild>
          <Link href={`/admin/settings/import-export/property-structure/review/${batchId}`}>
            {t('previewReviewImport')}
            <ArrowRight />
          </Link>
        </Button>
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <FileWarning className="mt-0.5 h-4 w-4" />
          {t('previewBlockedByErrors')}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/admin/settings/import-export/property-structure/upload">
            <ArrowLeft />
            {t('backToUpload')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/settings/import-export/property-structure/upload">
            <Upload />
            {t('startAnotherImport')}
          </Link>
        </Button>
      </div>
    </main>
  )
}

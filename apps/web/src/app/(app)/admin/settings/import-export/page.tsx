import Link from 'next/link'
import { Download, Upload, FileDown } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@beaconhs/ui'
import { assertCan } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { SettingsNavigation } from '../settings-form'

export default async function ImportExportPage() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  const t = await getTranslations('TenantSettings')

  return (
    <main className="space-y-6">
      <SettingsNavigation navigationLabel={t('title')} activeSection="importExport" />
      <header>
        <p className="text-sm text-blue-700">{t('title')}</p>
        <h1 className="text-3xl font-bold text-slate-950">{t('importExportTitle')}</h1>
        <p className="text-slate-600">{t('importExportDescription')}</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t('propertyStructure')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/admin/settings/import-export/property-structure/template">
              <Download />
              {t('downloadTemplate')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/settings/import-export/property-structure/upload">
              <Upload />
              {t('startImport')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/settings/import-export/property-structure/export">
              <FileDown />
              {t('exportData')}
            </Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('comingSoon')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          {t('futureImportsUnavailable')}
        </CardContent>
      </Card>
    </main>
  )
}

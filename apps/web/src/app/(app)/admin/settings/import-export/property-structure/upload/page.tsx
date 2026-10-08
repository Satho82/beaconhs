import { PropertyImportSteps } from '@/components/property-import-steps'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Button } from '@beaconhs/ui'
import { assertCan, can } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { SettingsNavigation } from '../../../settings-form'
import { PropertyStructureUploadForm } from './upload-form'

export default async function PropertyStructureUploadPage() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  assertCan(ctx, 'hospitality.manage')
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  const t = await getTranslations('TenantSettings')

  return (
    <main className="space-y-6">
      <PropertyImportSteps current="Upload" />
      <SettingsNavigation
        canManageIntegrations={can(ctx, 'admin.integrations.manage')}
        navigationLabel={t('title')}
        activeSection="importExport"
      />
      <header className="space-y-2">
        <p className="text-sm text-blue-700">{t('importExport')}</p>
        <h1 className="text-3xl font-bold text-slate-950">{t('propertyStructureUploadTitle')}</h1>
        <p className="text-slate-600">{t('propertyStructureUploadDescription')}</p>
      </header>
      <Button asChild variant="outline">
        <Link href="/admin/settings/import-export/property-structure/template">
          <Download />
          {t('downloadTemplate')}
        </Link>
      </Button>
      <PropertyStructureUploadForm
        copy={{
          selectFile: t('selectImportFile'),
          acceptedFormat: t('propertyStructureUploadRequirements'),
          uploadAndValidate: t('uploadAndValidate'),
          backToImportExport: t('backToImportExport'),
          selectedFile: t('selectedFile'),
          uploadFailure: t('propertyStructureUploadFailure'),
        }}
      />
    </main>
  )
}

import Link from 'next/link'
import { Download, Upload, FileDown } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@beaconhs/ui'
import { assertCan } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { SettingsNavigation } from '../settings-form'

export default async function ImportExportPage() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  return <main className="space-y-6"><SettingsNavigation navigationLabel="Tenant Settings" activeSection="importExport" /><header><p className="text-sm text-blue-700">Tenant Settings</p><h1 className="text-3xl font-bold text-slate-950">Data Import &amp; Export</h1><p className="text-slate-600">Safely onboard and export your property structure.</p></header><Card><CardHeader><CardTitle>Property Structure</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3"><Button asChild><Link href="/admin/settings/import-export/property-structure/template"><Download />Download Template</Link></Button><Button asChild variant="outline"><Link href="/admin/settings/import-export/property-structure/upload"><Upload />Start Import</Link></Button><Button asChild variant="outline"><Link href="/admin/settings/import-export/property-structure/export"><FileDown />Export Data</Link></Button></CardContent></Card><Card><CardHeader><CardTitle>Coming soon</CardTitle></CardHeader><CardContent className="text-sm text-slate-600">People, Compliance Registry, and Assets imports are not available yet.</CardContent></Card></main>
}

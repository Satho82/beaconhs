import Link from 'next/link'
import { Download, ArrowLeft } from 'lucide-react'
import { Button } from '@beaconhs/ui'
import { assertCan } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { AssetImportUploadForm } from './upload-form'

export default async function EquipmentImportPage() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'equipment.manage')
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <div><Link href="/equipment" className="text-sm text-slate-600"><ArrowLeft className="mr-1 inline h-4 w-4" />Assets & Reminders</Link>
      <h1 className="mt-4 text-3xl font-bold">Import assets</h1>
      <p className="mt-2 text-slate-600">Upload a CSV, review all rows, then explicitly confirm creation. Existing asset tags are skipped and never overwritten.</p>
    </div>
    <Button asChild variant="outline"><Link href="/equipment/import/template"><Download />Download CSV template</Link></Button>
    <AssetImportUploadForm />
  </main>
}
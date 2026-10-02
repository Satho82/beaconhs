'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@beaconhs/ui'
import { confirmPropertyStructureImport } from '@/lib/imports/property-structure-confirm'

export function ConfirmImportButton({
  batchId,
  label,
  acknowledgement,
  failure,
}: {
  batchId: string
  label: string
  acknowledgement: string
  failure: string
}) {
  const router = useRouter()
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        {acknowledgement}
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={!acknowledged || pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await confirmPropertyStructureImport({ batchId, acknowledged })
            if (!outcome.ok) return setError(outcome.error || failure)
            router.push(`/admin/settings/import-export/property-structure/result/${batchId}`)
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {label}
      </Button>
    </div>
  )
}

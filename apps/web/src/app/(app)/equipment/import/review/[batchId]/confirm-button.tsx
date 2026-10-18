'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@beaconhs/ui'
import { confirmAssetImport } from '@/lib/imports/assets-import-confirm'

export function ConfirmAssetImportButton({ batchId }: { batchId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await confirmAssetImport({ batchId, acknowledged: true })
            if (!outcome.ok) return setError(outcome.error)
            router.push('/equipment')
            router.refresh()
          })
        }
      >
        {pending ? 'Creating assets…' : 'Confirm and create assets'}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  )
}

'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, uploadReservedFile } from '@beaconhs/ui'
import { finalizeUpload, requestUpload } from '@/lib/uploads'
import { validateAssetImportUpload } from '@/lib/imports/assets-import-upload'

export function AssetImportUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  function submit() {
    if (!file) return
    startTransition(async () => {
      setError(null)
      try {
        const reservation = await requestUpload({
          kind: 'document',
          filename: file.name,
          contentType: 'text/csv',
          sizeBytes: file.size,
        })
        if (!reservation.ok) return setError(reservation.error)
        const finalized = await finalizeUpload(await uploadReservedFile(reservation, file))
        if (!finalized.ok) return setError(finalized.error)
        const outcome = await validateAssetImportUpload({ attachmentId: finalized.attachmentId })
        if (!outcome.ok) return setError(outcome.error)
        router.push('/equipment/import/review/' + outcome.batchId)
      } catch {
        setError('The CSV could not be uploaded and validated.')
      }
    })
  }
  return (
    <div className="space-y-4 rounded-xl border bg-white p-6">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="text/csv,.csv"
        disabled={pending}
        onChange={(event) => {
          setError(null)
          setFile(event.target.files?.item(0) ?? null)
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="flex min-h-40 w-full flex-col items-center justify-center rounded-lg border border-dashed border-teal-300 bg-teal-50/40 text-sm text-slate-700"
      >
        Select a CSV file (maximum 5 MB)
      </button>
      {file ? (
        <p className="text-sm">
          {file.name} · {file.size.toLocaleString()} bytes
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="button" onClick={submit} disabled={!file || pending}>
        {pending ? 'Validating…' : 'Upload and validate'}
      </Button>
    </div>
  )
}

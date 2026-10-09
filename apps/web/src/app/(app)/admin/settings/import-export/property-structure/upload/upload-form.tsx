'use client'

import { useTranslations } from 'next-intl'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { ArrowLeft, FileUp, Loader2 } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, uploadReservedFile } from '@beaconhs/ui'
import { finalizeUpload, requestUpload } from '@/lib/uploads'
import { validatePropertyStructureUpload } from '@/lib/imports/property-structure-upload'

type Copy = {
  selectFile: string
  acceptedFormat: string
  uploadAndValidate: string
  backToImportExport: string
  selectedFile: string
  uploadFailure: string
}

export function PropertyStructureUploadForm({ copy }: { copy: Copy }) {
  const tBatch = useTranslations('Generated')

  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function selectFile(next: File | null) {
    setError(null)
    if (!next) return setFile(null)
    if (next.type !== 'text/csv' || !next.name.toLowerCase().endsWith('.csv')) {
      setFile(null)
      setError(copy.acceptedFormat)
      return
    }
    if (next.size > 5_000_000) {
      setFile(null)
      setError(copy.acceptedFormat)
      return
    }
    setFile(next)
  }

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
        const outcome = await validatePropertyStructureUpload({
          attachmentId: finalized.attachmentId,
        })
        if (!outcome.ok) return setError(outcome.error)
        router.push(`/admin/settings/import-export/property-structure/preview/${outcome.batchId}`)
      } catch {
        setError(copy.uploadFailure)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.selectFile}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          disabled={pending}
          accept="text/csv,.csv"
          className="sr-only"
          onChange={(event) => selectFile(event.target.files?.item(0) ?? null)}
        />
        <button
          type="button"
          className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 px-6 py-10 text-sm text-slate-700 hover:border-blue-500"
          disabled={pending}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            if (!pending) selectFile(event.dataTransfer.files.item(0))
          }}
          onClick={() => inputRef.current?.click()}
        >
          <FileUp className="h-7 w-7 text-blue-600" />
          <span>{copy.selectFile}</span>
          <span className="text-xs text-slate-500">{copy.acceptedFormat}</span>
        </button>
        {file ? (
          <p className="text-sm text-slate-700">
            {copy.selectedFile}: {file.name} · {file.size.toLocaleString()}{' '}
            {tBatch('m_0106e43bb52715')}
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              className="ml-3"
              onClick={() => {
                setFile(null)
                setError(null)
                if (inputRef.current) inputRef.current.value = ''
              }}
            >
              {tBatch('m_02038865a602d6')}
            </Button>
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={!file || pending} onClick={submit}>
            {pending ? <Loader2 className="animate-spin" /> : <FileUp />}
            {copy.uploadAndValidate}
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/settings/import-export">
              <ArrowLeft />
              {copy.backToImportExport}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

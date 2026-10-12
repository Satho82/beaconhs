'use client'
import { GeneratedValue } from '@/i18n/generated'
import { useGeneratedValueTranslations } from '@/i18n/generated'

import { useRef, useState, type ReactNode, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Select } from '@beaconhs/ui'

export function ApprovalForm({
  action,
  initial,
  children,
  label,
  successPath,
}: {
  action: string
  initial?: Record<string, unknown>
  children: ReactNode
  label: string
  successPath?: string
}) {
  const router = useRouter()
  const key = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    key.current ??= crypto.randomUUID()
    try {
      const form = new FormData(event.currentTarget)
      const input: Record<string, unknown> = { ...initial }
      for (const [name, value] of form.entries()) if (typeof value === 'string') input[name] = value
      for (const name of ['stage', 'assignmentVersion', 'reminderHours'])
        if (name in input) input[name] = Number(input[name])
      if (action === 'configure') {
        input.emailEnabled = form.get('emailEnabled') === 'on'
        input.inAppEnabled = form.get('inAppEnabled') === 'on'
        input.stages = []
        for (let i = 0; i < 20; i++) {
          const name = input['stageName' + i],
            approverId = input['approver' + i],
            roleId = input['role' + i],
            maximumAmount = input['limit' + i]
          delete input['stageName' + i]
          delete input['approver' + i]
          delete input['role' + i]
          delete input['limit' + i]
          if (name && approverId)
            (input.stages as unknown[]).push({ name, approverId, roleId, maximumAmount })
        }
      } else input.idempotencyKey = key.current
      if (input.targetId === '') delete input.targetId
      const body = new FormData()
      body.set('action', action)
      body.set('input', JSON.stringify(input))
      const document = form.get('document')
      if (document instanceof File) body.set('document', document)
      const response = await fetch('/api/approvals', { method: 'POST', body })
      const result = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !result.id) throw new Error(result.error ?? 'Unable to save')
      key.current = null
      router.push(
        successPath ??
          (action === 'create' ? '/approvals/requests/' + result.id : location.pathname),
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        <GeneratedValue value={children} />
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          <GeneratedValue value={error} />
        </p>
      )}
      <Button type="submit" disabled={busy}>
        <GeneratedValue value={busy ? 'Saving…' : label} />
      </Button>
    </form>
  )
}
export function WorkflowStages({
  members,
  roles,
}: {
  members: Array<{ id: string; name: string }>
  roles: Array<{ id: string; name: string }>
}) {
  const tGeneratedValue = useGeneratedValueTranslations()

  const [count, setCount] = useState(1)
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <GeneratedValue value={'Stage'} />
            <GeneratedValue value={i + 1} /> <GeneratedValue value={'name'} />
            <input className="rounded border p-2" name={'stageName' + i} required maxLength={200} />
          </label>
          <label className="grid gap-1 text-sm">
            <GeneratedValue value={'Approver'} />
            <Select className="rounded border p-2" name={'approver' + i} required>
              <option value="">{tGeneratedValue('Select member')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  <GeneratedValue value={m.name} />
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-sm">
            <GeneratedValue value={'Required approval role'} />
            <Select className="rounded border p-2" name={'role' + i} required>
              <option value="">{tGeneratedValue('Select role')}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  <GeneratedValue value={r.name} />
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-sm">
            <GeneratedValue value={'Stage amount limit'} />
            <input className="rounded border p-2" name={'limit' + i} inputMode="decimal" required />
          </label>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={count >= 20}
          onClick={() => setCount(count + 1)}
        >
          <GeneratedValue value={'Add stage'} />
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={count <= 1}
          onClick={() => setCount(count - 1)}
        >
          <GeneratedValue value={'Remove last stage'} />
        </Button>
      </div>
    </div>
  )
}

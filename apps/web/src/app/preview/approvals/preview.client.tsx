'use client'
import { useState, useTransition, type ReactNode, type FormEvent } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Inbox,
  Plus,
  Settings,
  ShieldCheck,
  UploadCloud,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { Button, Card, Input, Select, Textarea } from '@beaconhs/ui'
import { SearchInput } from '@/components/search-input'
import { Pagination } from '@/components/pagination'
import { parseListParams } from '@/lib/list-params'
import ReactMarkdown from 'react-markdown'
import { APPROVALS_PREVIEW_ARTICLE } from '@/lib/manual/content/approvals-preview'
import {
  PREVIEW_ROOT,
  PREVIEW_SCREENS,
  PREVIEW_SOURCES,
  PREVIEW_PROPERTY,
  PREVIEW_PEOPLE,
  type PreviewScreen,
} from '@/lib/approvals/preview-fixtures'
import type { previewData, PreviewRequest } from '@/lib/approvals/preview-server'
import { submitPreviewRequest, decidePreviewRequest, configurePreviewWorkflow } from './actions'
import './preview.css'

type Data = Awaited<ReturnType<typeof previewData>>
type Detail = {
  stages: Array<{ position: number; name: string; approver_id: string }>
  events: Array<{
    id: string
    kind: string
    occurred_at: string
    evidence: { reason?: string; position?: number; audit?: { actor_user_id?: string } }
  }>
}
const money = (amount: number, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
const date = (value: string) =>
  new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/London',
  })
const source = (r: PreviewRequest) =>
  r.source_details ??
  PREVIEW_SOURCES.map((s) => ({ ...s, currency: 'GBP' })).find((s) => s.id === r.source_id)
const ref = (r: PreviewRequest) => `APP-${r.id.slice(0, 6).toUpperCase()}`
function Panel({
  title,
  subtitle,
  icon: Icon = FileText,
  children,
  className = '',
}: {
  title: string
  subtitle?: string
  icon?: typeof FileText
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={`approval-panel ${className}`}>
      <header className="approval-panel-heading">
        <Icon size={22} aria-hidden />
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      <div className="approval-panel-body">{children}</div>
    </Card>
  )
}
function Status({ request }: { request: PreviewRequest }) {
  const label =
    request.status === 'pending' && request.current_stage > 1 ? 'In review' : request.status
  return <span className={`approval-status ${request.status}`}>{label}</span>
}
function Unavailable({ children }: { children: ReactNode }) {
  return <p className="approval-unavailable">Preview only · {children}</p>
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="approval-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
function ProcessOverview() {
  const steps = [
    {
      icon: UploadCloud,
      title: '1. Submit',
      body: 'Upload invoice, quote or document. Complete key details and select a category.',
    },
    {
      icon: UserRound,
      title: '2. Review',
      body: 'Line manager or assigned approver reviews the request.',
    },
    {
      icon: CheckCircle2,
      title: '3. Approve / Reject',
      body: 'Approve or reject the request. Record a reason for rejection.',
    },
    {
      icon: Settings,
      title: '4. Process',
      body: 'Payment and source-record integration are not enabled in this preview.',
    },
    {
      icon: FileText,
      title: '5. Audit',
      body: 'Full decision history, with immutable events and audit evidence.',
    },
  ]
  return (
    <Panel
      title="Approval Process Overview"
      subtitle="From submission to approval with full traceability."
      icon={ClipboardCheck}
      className="approval-process"
    >
      <div className="approval-steps">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <div className="approval-step-wrap" key={title}>
            <div className="approval-step">
              <div className="approval-step-icon">
                <Icon size={34} />
                {index === 2 && <X size={28} className="text-[#ff7165]" />}
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
            {index < 4 && <ArrowRight className="approval-step-arrow" size={19} />}
          </div>
        ))}
      </div>
    </Panel>
  )
}
function UseCases() {
  return (
    <Panel title="Example Use Cases" icon={Users}>
      <ul className="approval-checklist">
        {[
          'Maintenance invoices',
          'Maintenance quotes',
          'General supplier invoices',
          'One-off purchases',
          'Planned works approval',
          'Contractor costs',
          'Non-maintenance expenses',
          'Budget control and oversight',
        ].map((item) => (
          <li key={item}>
            <CheckCircle2 size={16} />
            {item}
          </li>
        ))}
      </ul>
      <Unavailable>These describe the approved scope, not enabled integrations.</Unavailable>
    </Panel>
  )
}
function Benefits() {
  return (
    <Panel title="Key Benefits" icon={ShieldCheck}>
      <div className="space-y-3">
        {[
          ['Controlled spending', 'Right people, right approvals'],
          ['Full audit trail', 'Complete decision history'],
          ['Flexible workflow', 'Simple sequential approval stages'],
          ['Reusable across the platform', 'One shared approval engine'],
          ['Better visibility', 'Track each request and stage'],
        ].map(([title, body]) => (
          <div className="flex gap-2" key={title}>
            <CheckCircle2 className="shrink-0 text-teal-600" size={20} />
            <div>
              <strong>{title}</strong>
              <p className="mt-0.5 text-xs">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
function SubmitForm({ data }: { data: Data }) {
  const router = useRouter(),
    [workflow, setWorkflow] = useState(data.workflows[0]?.id ?? ''),
    [item, setItem] = useState({
      title: '',
      category: 'Maintenance',
      amount: '',
      currency: 'GBP',
      supplier: '',
      description: '',
      propertyId: PREVIEW_PROPERTY,
    }),
    [pending, start] = useTransition(),
    [error, setError] = useState(''),
    [key, setKey] = useState<string | null>(null)
  function change(field: keyof typeof item, value: string) {
    setItem((current) => ({ ...current, [field]: value }))
    setKey(null)
  }
  const permitted = data.permissions.includes('approvals.submit')
  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const idempotencyKey = key ?? crypto.randomUUID()
    setKey(idempotencyKey)
    start(async () => {
      try {
        const result = await submitPreviewRequest({
          ...item,
          amount: Number(item.amount),
          workflowId: workflow,
          idempotencyKey,
        })
        if (!result.ok) setError(result.error)
        else {
          setKey(null)
          router.push(`${PREVIEW_ROOT}/detail?id=${result.id}&submitted=1`)
        }
      } catch {
        setError(
          'Submission could not be confirmed. Retry without changing the form to safely check the same request.',
        )
      }
    })
  }
  return (
    <Panel
      title="Submit a New Request"
      subtitle="Simple form with a source-record reference"
      icon={FileText}
    >
      <form onSubmit={submit} className="space-y-3">
        <h3>Create Approval Request</h3>
        <Field label="Title *">
          <Input
            required
            maxLength={300}
            value={item.title}
            onChange={(e) => change('title', e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label="Category *">
          <Select
            aria-label="Category"
            value={item.category}
            onChange={(e) => change('category', e.target.value)}
            disabled={pending}
          >
            {['Maintenance', 'General', 'Contractor'].map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount *">
            <Input
              type="number"
              required
              min="0.01"
              max="999999999"
              step="0.01"
              value={item.amount}
              onChange={(e) => change('amount', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label="Currency">
            <Select
              aria-label="Currency"
              value={item.currency}
              onChange={(e) => change('currency', e.target.value)}
              disabled={pending}
            >
              {['GBP', 'EUR', 'USD'].map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier">
            <Input
              maxLength={200}
              value={item.supplier}
              onChange={(e) => change('supplier', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label="Related Property">
            <Select
              aria-label="Related Property"
              value={item.propertyId}
              onChange={(e) => change('propertyId', e.target.value)}
              disabled={pending}
            >
              <option value={PREVIEW_PROPERTY}>One Fifty Fenchurch</option>
            </Select>
          </Field>
        </div>
        <Field label="Approval workflow *">
          <Select
            aria-label="Approval workflow"
            value={workflow}
            disabled={pending}
            onChange={(e) => {
              setWorkflow(e.target.value)
              setKey(null)
            }}
          >
            {data.workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.stages.length} stage(s)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Related work order (optional)">
          <Select disabled aria-label="Related work order" value="unavailable">
            <option value="unavailable">Unavailable · source integration pending</option>
          </Select>
        </Field>
        <div className="approval-upload">
          <UploadCloud size={27} />
          <span>Document upload unavailable</span>
          <small>Storage integration is not part of Batch 01.</small>
        </div>
        <Field label="Description *">
          <Textarea
            required
            maxLength={4000}
            value={item.description}
            onChange={(e) => change('description', e.target.value)}
            disabled={pending}
            rows={3}
          />
        </Field>
        <Unavailable>
          Synthetic submissions only. Form details are saved with the isolated audit snapshot, not
          as financial or source-module records.
        </Unavailable>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {!permitted && <p className="text-amber-800">Switch to the requester account to submit.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              setItem({
                title: '',
                category: 'Maintenance',
                amount: '',
                currency: 'GBP',
                supplier: '',
                description: '',
                propertyId: PREVIEW_PROPERTY,
              })
              setKey(null)
              setError('')
            }}
          >
            Reset form
          </Button>
          <Button type="submit" size="sm" disabled={!permitted || pending || !workflow}>
            {pending ? 'Submitting…' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </Panel>
  )
}
function RequestTable({
  data,
  mode,
  search,
  compact = false,
}: {
  data: Data
  mode: 'my' | 'all' | 'manager'
  search: Record<string, string | string[] | undefined>
  compact?: boolean
}) {
  const pathname = usePathname(),
    router = useRouter(),
    params = parseListParams(search, {
      sort: 'created_at',
      allowedSorts: ['created_at'],
      perPage: 5,
    })
  const status = typeof search.status === 'string' ? search.status : 'all',
    category = typeof search.category === 'string' ? search.category : 'all'
  const filtered = data.requests.filter(
    (r) =>
      (mode !== 'my' || r.requester_id === data.memberId) &&
      (mode !== 'manager' || (r.approver_id === data.memberId && r.status === 'pending')) &&
      (status === 'all' || r.status === status) &&
      (category === 'all' || source(r)?.category === category) &&
      (!params.q ||
        `${r.title} ${ref(r)} ${r.creator}`.toLowerCase().includes(params.q.toLowerCase())),
  )
  const rows = filtered.slice((params.page - 1) * params.perPage, params.page * params.perPage)
  function filter(key: string, value: string) {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries(search))
      if (typeof v === 'string' && k !== 'page') next.set(k, v)
    next.set(key, value)
    router.push(`${pathname}?${next}`)
  }
  return (
    <Panel
      title={
        mode === 'my' ? 'My Requests' : mode === 'manager' ? 'Assigned to Me' : 'Approval Inbox'
      }
      subtitle={
        mode === 'my'
          ? 'Track the status of your submissions'
          : mode === 'manager'
            ? 'Pending decisions assigned to your account'
            : 'One place to review every visible approval'
      }
      icon={mode === 'manager' ? Users : Inbox}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3>{mode === 'my' ? 'My Approval Requests' : 'Approval requests'}</h3>
        <Button size="sm" asChild>
          <Link href={`${PREVIEW_ROOT}/submit`}>
            <Plus size={14} />
            New Request
          </Link>
        </Button>
      </div>
      <SearchInput placeholder="Search requests…" />
      <div className="my-2 flex flex-wrap gap-2">
        <Select
          aria-label="Filter status"
          value={status}
          onChange={(e) => filter('status', e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Select
          aria-label="Filter category"
          value={category}
          onChange={(e) => filter('category', e.target.value)}
        >
          <option value="all">All categories</option>
          {['Maintenance', 'General', 'Contractor'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className={`approval-table ${compact ? 'compact' : ''}`}>
          <thead>
            <tr>
              <th>Ref</th>
              <th>Title</th>
              {!compact && <th>Category</th>}
              <th>Amount*</th>
              <th>Status</th>
              {!compact && <th>Created</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`${PREVIEW_ROOT}/detail?id=${r.id}`}>{ref(r)}</Link>
                </td>
                <td>
                  <Link href={`${PREVIEW_ROOT}/detail?id=${r.id}`}>{r.title}</Link>
                </td>
                {!compact && <td>{source(r)?.category}</td>}
                <td>{money(source(r)?.amount ?? 0, source(r)?.currency)}</td>
                <td>
                  <Status request={r} />
                </td>
                {!compact && <td>{date(r.created_at)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="p-6 text-center text-slate-500">No requests match these filters.</div>
        )}
      </div>
      <Pagination
        basePath={pathname}
        currentParams={search}
        total={filtered.length}
        page={params.page}
        perPage={params.perPage}
      />
      <p className="text-[10px] text-slate-500">
        *Synthetic display amounts. Request states come from the isolated engine.
      </p>
    </Panel>
  )
}
function Details({
  request,
  detail,
  manager = false,
  data,
}: {
  request: PreviewRequest | null
  detail: Detail | null
  manager?: boolean
  data: Data
}) {
  const router = useRouter(),
    [tab, setTab] = useState('timeline'),
    [decision, setDecision] = useState<'approve' | 'reject'>('approve'),
    [reason, setReason] = useState(''),
    [pending, start] = useTransition(),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(''),
    [key, setKey] = useState<string | null>(null)
  if (!request || !detail)
    return (
      <Panel title="Approval Request Detail">
        <p>No request yet. Submit a synthetic request to begin.</p>
      </Panel>
    )
  const item = source(request),
    canDecide =
      data.permissions.includes('approvals.decide') &&
      request.approver_id === data.memberId &&
      request.requester_id !== data.memberId &&
      request.status === 'pending'
  function save(e: FormEvent) {
    e.preventDefault()
    if (!request) return
    setError('')
    setSaved('')
    const idempotencyKey = key ?? crypto.randomUUID()
    setKey(idempotencyKey)
    start(async () => {
      const result = await decidePreviewRequest({
        requestId: request.id,
        stage: request.current_stage,
        decision,
        reason,
        idempotencyKey,
      })
      if (!result.ok) setError(result.error)
      else {
        setSaved('Decision saved to the isolated engine.')
        router.refresh()
      }
    })
  }
  return (
    <Panel
      title={manager ? 'Manager Approval View' : 'Approval Request Detail'}
      subtitle={
        manager
          ? 'Review the request and record your decision'
          : 'Full information, documents and event history'
      }
      icon={manager ? Users : ClipboardCheck}
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3>{ref(request)}</h3>
        <Status request={request} />
      </div>
      <h3 className="mb-4">{request.title}</h3>
      <p className="mb-3 text-xs">
        Approval stages:{' '}
        {detail.stages
          .map(
            (stage) =>
              `${stage.position}. ${stage.name} · ${Object.values(PREVIEW_PEOPLE).find((person) => person.id === stage.approver_id)?.name ?? 'Assigned approver'}`,
          )
          .join(' → ')}
      </p>
      <dl className="approval-facts">
        {[
          ['Category', item?.category ?? '—'],
          [
            'Amount',
            `${money(item?.amount ?? 0, item?.currency)} ${item?.currency ?? 'GBP'} · synthetic`,
          ],
          ['Supplier', item?.supplier ?? '—'],
          ['Property', 'One Fifty Fenchurch'],
          ['Created by', request.creator],
          ['Created', date(request.created_at)],
          [
            'Current stage',
            `${request.current_stage} of ${request.stage_count} · ${request.approver}`,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h4 className="mt-4 font-semibold">Description</h4>
      <p className="mt-1 text-xs">{item?.description}</p>
      <div className="approval-tabs mt-4" role="tablist" aria-label="Request detail sections">
        {['timeline', 'document', 'comments'].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            type="button"
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-36 py-3">
        {tab === 'timeline' ? (
          <ol className="approval-timeline">
            {detail.events.map((e) => (
              <li key={e.id}>
                <span className={e.kind === 'reject' ? 'rejected' : ''}>
                  <Check size={12} />
                </span>
                <div>
                  <strong>
                    {e.kind === 'submitted'
                      ? 'Request submitted'
                      : e.kind === 'approve'
                        ? `Stage ${e.evidence.position} approved`
                        : `Stage ${e.evidence.position} rejected`}
                  </strong>
                  <p>
                    {Object.values(PREVIEW_PEOPLE).find(
                      (p) => p.user === e.evidence.audit?.actor_user_id,
                    )?.name ?? 'Synthetic actor'}
                  </p>
                  <time>{date(e.occurred_at)}</time>
                  {e.evidence.reason && <p className="mt-1 italic">{e.evidence.reason}</p>}
                </div>
              </li>
            ))}
            {request.status === 'pending' && (
              <li>
                <span className="pending">
                  <UserRound size={12} />
                </span>
                <div>
                  <strong>Pending review</strong>
                  <p>Awaiting {request.approver}</p>
                </div>
              </li>
            )}
          </ol>
        ) : tab === 'document' ? (
          <div className="approval-upload">
            <FileText size={28} />
            <strong>No document attached</strong>
            <small>File upload and document preview are unavailable in Batch 01.</small>
          </div>
        ) : (
          <Unavailable>
            Standalone comments are not implemented. Decision reasons are recorded in the timeline.
          </Unavailable>
        )}
      </div>
      {manager ? (
        <form onSubmit={save} className="space-y-3 border-t border-slate-200 pt-3">
          <h4 className="font-semibold">Your decision</h4>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="decision"
                checked={decision === 'approve'}
                onChange={() => {
                  setDecision('approve')
                  setKey(null)
                }}
                disabled={!canDecide}
              />
              Approve
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="decision"
                checked={decision === 'reject'}
                onChange={() => {
                  setDecision('reject')
                  setKey(null)
                }}
                disabled={!canDecide}
              />
              Reject
            </label>
            <label className="flex items-center gap-1 text-slate-400">
              <input type="radio" disabled />
              More information (unavailable)
            </label>
          </div>
          <Field
            label={decision === 'reject' ? 'Rejection reason *' : 'Decision comment (optional)'}
          >
            <Textarea
              required={decision === 'reject'}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setKey(null)
              }}
              disabled={!canDecide}
              maxLength={4000}
              placeholder="Add your decision comment…"
              rows={3}
            />
          </Field>
          {!canDecide && (
            <p className="text-xs text-amber-800">
              {request.status !== 'pending'
                ? 'This request is finalised. Its decision history cannot be edited.'
                : `Only the assigned approver (${request.approver}) can decide. Switch review account if needed.`}
            </p>
          )}
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-teal-700">
              {saved}
            </p>
          )}
          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={!canDecide || pending || (decision === 'reject' && !reason.trim())}
          >
            {pending ? 'Saving decision…' : 'Submit Decision'}
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
          <Button size="sm" variant="outline" disabled>
            Cancel request · unavailable
          </Button>
          <Button size="sm" asChild>
            <Link href={`${PREVIEW_ROOT}/manager?id=${request.id}`}>Open manager view</Link>
          </Button>
        </div>
      )}
    </Panel>
  )
}
function Permissions({ data, compact = false }: { data: Data; compact?: boolean }) {
  return (
    <Panel
      title="Permissions & Roles"
      subtitle="Existing RBAC, checked on every decision"
      icon={Settings}
    >
      <table className="approval-table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Actual preview permissions</th>
          </tr>
        </thead>
        <tbody>
          {data.roles.map((role) => (
            <tr key={role.name}>
              <td>{role.name}</td>
              <td>{role.permissions.map((p) => p.replace('approvals.', '')).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="approval-checklist mt-3">
        <li>
          <CheckCircle2 size={15} />
          Tenant and property isolation
        </li>
        <li>
          <CheckCircle2 size={15} />
          Assigned approvers only
        </li>
        <li>
          <CheckCircle2 size={15} />
          No self-approval
        </li>
      </ul>
      {!compact && (
        <>
          <h3 className="mt-5">Approved role model · future configuration</h3>
          <p className="mt-2">
            Staff submit requests; line managers review; managers and property managers oversee
            their permitted properties; finance can confirm the final stage.
          </p>
          <Unavailable>
            Approval limits by amount, category and role are not implemented. Role editing stays in
            the existing administration system.
          </Unavailable>
        </>
      )}
    </Panel>
  )
}
function Options({ data, compact = false }: { data: Data; compact?: boolean }) {
  const router = useRouter(),
    [name, setName] = useState(''),
    [count, setCount] = useState('2'),
    [pending, start] = useTransition(),
    [message, setMessage] = useState('')
  function configure(e: FormEvent) {
    e.preventDefault()
    start(async () => {
      const result = await configurePreviewWorkflow({
        propertyId: PREVIEW_PROPERTY,
        name,
        stages: [
          { name: 'Line manager review', approverId: PREVIEW_PEOPLE.manager.id },
          ...(count === '2'
            ? [{ name: 'Finance confirmation', approverId: PREVIEW_PEOPLE.finance.id }]
            : []),
        ],
      })
      setMessage(
        result.ok ? 'New immutable workflow created in the isolated fixture.' : result.error,
      )
      if (result.ok) {
        setName('')
        router.refresh()
      }
    })
  }
  return (
    <Panel title="Configurable Options" icon={Settings}>
      <ul className="approval-checklist">
        <li>
          <CheckCircle2 size={16} />
          Single or sequential approval stages
        </li>
        <li>
          <CheckCircle2 size={16} />
          Property-scoped assigned approvers
        </li>
        <li>
          <CheckCircle2 size={16} />
          Immutable audit log and reporting
        </li>
      </ul>
      {compact ? (
        <Button size="sm" variant="outline" asChild className="mt-3">
          <Link href={`${PREVIEW_ROOT}/options`}>Configure workflows</Link>
        </Button>
      ) : (
        <form onSubmit={configure} className="mt-4 space-y-3">
          <h3>Create a workflow version</h3>
          <Field label="Workflow name">
            <Input
              required
              minLength={1}
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maintenance invoice review"
            />
          </Field>
          <Field label="Approval stages">
            <Select
              aria-label="Approval stages"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            >
              <option value="1">1 · Jamie Patel (Line manager)</option>
              <option value="2">2 · Jamie Patel → Sam Taylor (Finance)</option>
            </Select>
          </Field>
          <Button
            type="submit"
            disabled={pending || !data.configurePropertyIds.includes(PREVIEW_PROPERTY)}
          >
            {pending ? 'Creating…' : 'Create Workflow'}
          </Button>
          {message && <p role="status">{message}</p>}
          <p className="text-xs text-slate-500">
            {data.workflows.length} immutable workflow versions available. Workflow administration
            requires an explicit property-scoped configuration grant. Existing requests retain their
            original stages.
          </p>
        </form>
      )}
      <Unavailable>
        Amount limits, supplier management, custom fields, notifications, delegation and finance
        integrations are unavailable.
      </Unavailable>
    </Panel>
  )
}
function Reports({ data, compact = false }: { data: Data; compact?: boolean }) {
  return (
    <Panel title="Reporting & Audit" icon={BarChart3}>
      <div className="grid grid-cols-3 gap-2">
        {(['pending', 'approved', 'rejected'] as const).map((status) => (
          <Link
            href={`${PREVIEW_ROOT}/inbox?status=${status}`}
            className="approval-metric"
            key={status}
          >
            <strong>{data.requests.filter((r) => r.status === status).length}</strong>
            <span>{status}</span>
          </Link>
        ))}
      </div>
      <ul className="approval-checklist mt-4">
        <li>
          <CheckCircle2 size={16} />
          Approval status in the isolated fixture
        </li>
        <li>
          <CheckCircle2 size={16} />
          Who decided, when, and why
        </li>
        <li>
          <CheckCircle2 size={16} />
          Immutable request timeline
        </li>
      </ul>
      {!compact && (
        <p className="mt-3">
          Open a request to inspect its event history. Counts cover the bounded synthetic review
          dataset (up to 200 requests), not DEV or financial reporting.
        </p>
      )}
      <Unavailable>Spend analytics and audited CSV / Excel exports are not enabled.</Unavailable>
    </Panel>
  )
}
export function ApprovalsPreview({
  screen,
  data,
  selected,
  detail,
  search,
}: {
  screen: PreviewScreen
  data: Data
  selected: PreviewRequest | null
  detail: Detail | null
  search: Record<string, string | string[] | undefined>
}) {
  return (
    <div className="approvals-preview">
      <div className="approval-preview-banner">
        <span>
          <strong>ISOLATED VISUAL PREVIEW</strong> · Synthetic records only · No DEV connection
        </span>
        <Link href={`${PREVIEW_ROOT}/login`}>Switch review account</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Approvals</h1>
          <p className="mt-1 text-sm text-slate-500">Simple. Controlled. Auditable.</p>
        </div>
        <Link href={`${PREVIEW_ROOT}/guide`} className="text-xs underline underline-offset-4">
          Preview guide & limitations
        </Link>
      </div>
      <nav aria-label="Approvals navigation" className="approval-screen-nav">
        {PREVIEW_SCREENS.map(([key, label]) => (
          <Link
            key={key}
            aria-current={screen === key ? 'page' : undefined}
            href={key === 'overview' ? PREVIEW_ROOT : `${PREVIEW_ROOT}/${key}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {screen === 'detail' &&
        search.submitted === '1' &&
        selected?.requester_id === data.memberId && (
          <p role="status" className="mb-3 text-teal-700">
            Request submitted successfully to the isolated preview.
          </p>
        )}
      {screen === 'overview' ? (
        <>
          <div className="approval-overview-top">
            <ProcessOverview />
            <UseCases />
            <Benefits />
          </div>
          <div className="approval-overview-board">
            <SubmitForm data={data} />
            <div className="min-w-0 space-y-3">
              <RequestTable data={data} mode="my" search={search} compact />
              <Details key={selected?.id} request={selected} detail={detail} data={data} />
            </div>
            <Details key={selected?.id} request={selected} detail={detail} data={data} manager />
            <div className="min-w-0 space-y-3">
              <Permissions data={data} compact />
              <Options data={data} compact />
              <Reports data={data} compact />
            </div>
          </div>
        </>
      ) : screen === 'submit' ? (
        <div className="mx-auto max-w-2xl">
          <SubmitForm data={data} />
        </div>
      ) : screen === 'my-requests' || screen === 'inbox' ? (
        <RequestTable data={data} mode={screen === 'my-requests' ? 'my' : 'all'} search={search} />
      ) : screen === 'manager' ? (
        <div className="grid items-start gap-4 xl:grid-cols-[1.3fr_1fr]">
          <RequestTable data={data} mode="manager" search={search} />
          <Details key={selected?.id} request={selected} detail={detail} data={data} manager />
        </div>
      ) : screen === 'detail' ? (
        <div className="mx-auto max-w-3xl">
          <Details key={selected?.id} request={selected} detail={detail} data={data} />
        </div>
      ) : screen === 'permissions' ? (
        <Permissions data={data} />
      ) : screen === 'options' ? (
        <div className="mx-auto max-w-2xl">
          <Options data={data} />
        </div>
      ) : screen === 'reporting' ? (
        <div className="space-y-4">
          <Reports data={data} />
          <RequestTable data={data} mode="all" search={search} />
        </div>
      ) : screen === 'unavailable' ? (
        <Panel
          title={`${typeof search.module === 'string' ? search.module : 'Module'} · outside this preview`}
        >
          <p>
            This tile preserves the approved shared navigation. Its module is not enabled in this
            isolated Approvals review. No Risk, People or other source-module workflow has been
            changed.
          </p>
          <Button asChild className="mt-4">
            <Link href={PREVIEW_ROOT}>Back to Approvals</Link>
          </Button>
        </Panel>
      ) : (
        <Panel title={APPROVALS_PREVIEW_ARTICLE.title} icon={FileCheck2}>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{APPROVALS_PREVIEW_ARTICLE.body}</ReactMarkdown>
          </div>
        </Panel>
      )}
      <footer className="mt-6 flex flex-wrap justify-between gap-2 text-[10px] text-slate-500">
        <span>Uvanoo · Safer Spaces. Better Stays.</span>
        <span>V1.4 Approvals · Owner visual review · Synthetic fixture</span>
      </footer>
    </div>
  )
}

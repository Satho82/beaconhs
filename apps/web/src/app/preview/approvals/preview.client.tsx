'use client'
import { GeneratedValue, useGeneratedTranslations } from '@/i18n/generated'
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
          <h2>
            <GeneratedValue value={title} />
          </h2>
          {subtitle && (
            <p>
              <GeneratedValue value={subtitle} />
            </p>
          )}
        </div>
      </header>
      <div className="approval-panel-body">{children}</div>
    </Card>
  )
}
function Status({ request }: { request: PreviewRequest }) {
  const label =
    request.status === 'pending' && request.current_stage > 1 ? 'In review' : request.status
  return (
    <span className={`approval-status ${request.status}`}>
      <GeneratedValue value={label} />
    </span>
  )
}
function Unavailable({ children }: { children: ReactNode }) {
  const translateApprovals = useGeneratedTranslations()

  return (
    <p className="approval-unavailable">
      {translateApprovals('m_0515846bef8f62')} {children}
    </p>
  )
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="approval-field">
      <span>
        <GeneratedValue value={label} />
      </span>
      {children}
    </label>
  )
}
function ProcessOverview() {
  const translateApprovals = useGeneratedTranslations()

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
      title={translateApprovals('m_1f1147c1113d9f')}
      subtitle={translateApprovals('m_1281e11f54aa6c')}
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
              <h3>
                <GeneratedValue value={title} />
              </h3>
              <p>
                <GeneratedValue value={body} />
              </p>
            </div>
            {index < 4 && <ArrowRight className="approval-step-arrow" size={19} />}
          </div>
        ))}
      </div>
    </Panel>
  )
}
function UseCases() {
  const translateApprovals = useGeneratedTranslations()

  return (
    <Panel title={translateApprovals('m_1738e2b197f440')} icon={Users}>
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
      <Unavailable>{translateApprovals('m_126a2401a192f9')}</Unavailable>
    </Panel>
  )
}
function Benefits() {
  const translateApprovals = useGeneratedTranslations()

  return (
    <Panel title={translateApprovals('m_00dca709831bff')} icon={ShieldCheck}>
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
              <strong>
                <GeneratedValue value={title} />
              </strong>
              <p className="mt-0.5 text-xs">
                <GeneratedValue value={body} />
              </p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
function SubmitForm({ data }: { data: Data }) {
  const translateApprovals = useGeneratedTranslations()

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
      title={translateApprovals('m_14da8abd95f1ca')}
      subtitle={translateApprovals('m_10b4de78223ce1')}
      icon={FileText}
    >
      <form onSubmit={submit} className="space-y-3">
        <h3>{translateApprovals('m_18ab16f60a07fc')}</h3>
        <Field label={translateApprovals('m_061226f35d3d3e')}>
          <Input
            required
            maxLength={300}
            value={item.title}
            onChange={(e) => change('title', e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label={translateApprovals('m_147f0d8b74d02d')}>
          <Select
            aria-label={translateApprovals('m_108b41637f364f')}
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
          <Field label={translateApprovals('m_087227caf570c1')}>
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
          <Field label={translateApprovals('m_0b48c931cca72a')}>
            <Select
              aria-label={translateApprovals('m_0b48c931cca72a')}
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
          <Field label={translateApprovals('m_0cb8868f712422')}>
            <Input
              maxLength={200}
              value={item.supplier}
              onChange={(e) => change('supplier', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label={translateApprovals('m_1b52527ec98825')}>
            <Select
              aria-label={translateApprovals('m_1b52527ec98825')}
              value={item.propertyId}
              onChange={(e) => change('propertyId', e.target.value)}
              disabled={pending}
            >
              <option value={PREVIEW_PROPERTY}>One Fifty Fenchurch</option>
            </Select>
          </Field>
        </div>
        <Field label={translateApprovals('m_07c8fc9b99b730')}>
          <Select
            aria-label={translateApprovals('m_03d7daeecf4700')}
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
        <Field label={translateApprovals('m_17b9c507860778')}>
          <Select disabled aria-label={translateApprovals('m_058827f581ffe4')} value="unavailable">
            <option value="unavailable">Unavailable · source integration pending</option>
          </Select>
        </Field>
        <div className="approval-upload">
          <UploadCloud size={27} />
          <span>{translateApprovals('m_04bafe6d106bea')}</span>
          <small>{translateApprovals('m_1bd66676e8f406')}</small>
        </div>
        <Field label={translateApprovals('m_0b18b50bf6b13c')}>
          <Textarea
            required
            maxLength={4000}
            value={item.description}
            onChange={(e) => change('description', e.target.value)}
            disabled={pending}
            rows={3}
          />
        </Field>
        <Unavailable> {translateApprovals('m_12b96c451c5537')} </Unavailable>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {!permitted && <p className="text-amber-800">{translateApprovals('m_01879cc6bbc099')}</p>}
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
            {' '}
            {translateApprovals('m_15860172145c64')}{' '}
          </Button>
          <Button type="submit" size="sm" disabled={!permitted || pending || !workflow}>
            {pending
              ? translateApprovals('m_00cfcb628bc131')
              : translateApprovals('m_0f1972b07bac80')}
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
  const translateApprovals = useGeneratedTranslations()

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
        mode === 'my'
          ? translateApprovals('m_01698d0caec20c')
          : mode === 'manager'
            ? translateApprovals('m_0f95749a2e9842')
            : translateApprovals('m_0927c1ad5213a7')
      }
      subtitle={
        mode === 'my'
          ? translateApprovals('m_119448661e1175')
          : mode === 'manager'
            ? translateApprovals('m_16caca81fac470')
            : translateApprovals('m_1696649aa07ad5')
      }
      icon={mode === 'manager' ? Users : Inbox}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3>
          {mode === 'my'
            ? translateApprovals('m_16beaf32db06ee')
            : translateApprovals('m_017ad35b6f26b4')}
        </h3>
        <Button size="sm" asChild>
          <Link href={`${PREVIEW_ROOT}/submit`}>
            <Plus size={14} /> {translateApprovals('m_16356ebcf67975')}{' '}
          </Link>
        </Button>
      </div>
      <SearchInput placeholder={translateApprovals('m_1844ee82bd7861')} />
      <div className="my-2 flex flex-wrap gap-2">
        <Select
          aria-label={translateApprovals('m_0f270ed3296b44')}
          value={status}
          onChange={(e) => filter('status', e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Select
          aria-label={translateApprovals('m_03c683eaae2e7e')}
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
              <th>{translateApprovals('m_036b564bb88dfe')}</th>
              <th>{translateApprovals('m_0decefd558c355')}</th>
              {!compact && <th>{translateApprovals('m_108b41637f364f')}</th>}
              <th>{translateApprovals('m_0c84194724fa06')}</th>
              <th>{translateApprovals('m_0b9da892d6faf0')}</th>
              {!compact && <th>{translateApprovals('m_10cbe051fb5e05')}</th>}
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
          <div className="p-6 text-center text-slate-500">
            {translateApprovals('m_0b81e9c8ed007d')}
          </div>
        )}
      </div>
      <Pagination
        basePath={pathname}
        currentParams={search}
        total={filtered.length}
        page={params.page}
        perPage={params.perPage}
      />
      <p className="text-[10px] text-slate-500"> {translateApprovals('m_06153958b563f2')} </p>
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
  const translateApprovals = useGeneratedTranslations()

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
      <Panel title={translateApprovals('m_0cdb2cdc0ba4ab')}>
        <p>{translateApprovals('m_153d2438b5392b')}</p>
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
      title={
        manager ? translateApprovals('m_14dd08105e8856') : translateApprovals('m_0cdb2cdc0ba4ab')
      }
      subtitle={
        manager ? translateApprovals('m_0eca62baf770d0') : translateApprovals('m_1cc6bf5c08195c')
      }
      icon={manager ? Users : ClipboardCheck}
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3>{ref(request)}</h3>
        <Status request={request} />
      </div>
      <h3 className="mb-4">{request.title}</h3>
      <p className="mb-3 text-xs">
        {' '}
        {translateApprovals('m_147aeddea99847')}{' '}
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
            <dt>
              <GeneratedValue value={label} />
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h4 className="mt-4 font-semibold">{translateApprovals('m_14d923495cf14c')}</h4>
      <p className="mt-1 text-xs">{item?.description}</p>
      <div
        className="approval-tabs mt-4"
        role="tablist"
        aria-label={translateApprovals('m_108bc08e734218')}
      >
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
                      ? translateApprovals('m_190019081196ed')
                      : e.kind === 'approve'
                        ? translateApprovals('m_0446b7755bff47', { value0: e.evidence.position })
                        : translateApprovals('m_00011280c0a13c', { value0: e.evidence.position })}
                  </strong>
                  <p>
                    {Object.values(PREVIEW_PEOPLE).find(
                      (p) => p.user === e.evidence.audit?.actor_user_id,
                    )?.name ?? translateApprovals('m_139eeb83b73358')}
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
                  <strong>{translateApprovals('m_08b7d8b7086dea')}</strong>
                  <p>
                    {translateApprovals('m_14b6b9072539da')} {request.approver}
                  </p>
                </div>
              </li>
            )}
          </ol>
        ) : tab === 'document' ? (
          <div className="approval-upload">
            <FileText size={28} />
            <strong>{translateApprovals('m_144a3f957c319c')}</strong>
            <small>{translateApprovals('m_0376fbe9d3b9d3')}</small>
          </div>
        ) : (
          <Unavailable> {translateApprovals('m_11bac6e09f8028')} </Unavailable>
        )}
      </div>
      {manager ? (
        <form onSubmit={save} className="space-y-3 border-t border-slate-200 pt-3">
          <h4 className="font-semibold">{translateApprovals('m_064209f1d1e51a')}</h4>
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
              />{' '}
              {translateApprovals('m_05194a49d7f46e')}{' '}
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
              />{' '}
              {translateApprovals('m_0f51548c04b27f')}{' '}
            </label>
            <label className="flex items-center gap-1 text-slate-400">
              <input type="radio" disabled /> {translateApprovals('m_18a4f0881ebed9')}{' '}
            </label>
          </div>
          <Field
            label={
              decision === 'reject'
                ? translateApprovals('m_1618b8b14c491e')
                : translateApprovals('m_134bbadc9b1178')
            }
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
              placeholder={translateApprovals('m_090241bf9cdec5')}
              rows={3}
            />
          </Field>
          {!canDecide && (
            <p className="text-xs text-amber-800">
              {request.status !== 'pending'
                ? translateApprovals('m_1398a59fd30cc8')
                : translateApprovals('m_0d2368f8539928', { value0: request.approver })}
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
            {pending
              ? translateApprovals('m_0e0188dbd42696')
              : translateApprovals('m_1b726b356d6f4b')}
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
          <Button size="sm" variant="outline" disabled>
            {' '}
            {translateApprovals('m_19a38d38d19201')}{' '}
          </Button>
          <Button size="sm" asChild>
            <Link href={`${PREVIEW_ROOT}/manager?id=${request.id}`}>
              {translateApprovals('m_03f26b57f1851b')}
            </Link>
          </Button>
        </div>
      )}
    </Panel>
  )
}
function Permissions({ data, compact = false }: { data: Data; compact?: boolean }) {
  const translateApprovals = useGeneratedTranslations()

  return (
    <Panel
      title={translateApprovals('m_02ec9e3ec7c000')}
      subtitle={translateApprovals('m_00e2e64cfd45f0')}
      icon={Settings}
    >
      <table className="approval-table">
        <thead>
          <tr>
            <th>{translateApprovals('m_1099c1fe8b6614')}</th>
            <th>{translateApprovals('m_0f28617ee95614')}</th>
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
          <CheckCircle2 size={15} /> {translateApprovals('m_0f77e04d5c043b')}{' '}
        </li>
        <li>
          <CheckCircle2 size={15} /> {translateApprovals('m_1f37130daf7314')}{' '}
        </li>
        <li>
          <CheckCircle2 size={15} /> {translateApprovals('m_0eaa3751e7d9a8')}{' '}
        </li>
      </ul>
      {!compact && (
        <>
          <h3 className="mt-5">{translateApprovals('m_17b196a299db53')}</h3>
          <p className="mt-2"> {translateApprovals('m_1384f18bcfcc22')} </p>
          <Unavailable> {translateApprovals('m_18504b6e7b25c5')} </Unavailable>
        </>
      )}
    </Panel>
  )
}
function Options({ data, compact = false }: { data: Data; compact?: boolean }) {
  const translateApprovals = useGeneratedTranslations()

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
    <Panel title={translateApprovals('m_0376a3567bea88')} icon={Settings}>
      <ul className="approval-checklist">
        <li>
          <CheckCircle2 size={16} /> {translateApprovals('m_0fb0850f3394d7')}{' '}
        </li>
        <li>
          <CheckCircle2 size={16} /> {translateApprovals('m_008d554db1838b')}{' '}
        </li>
        <li>
          <CheckCircle2 size={16} /> {translateApprovals('m_08efd2320beb08')}{' '}
        </li>
      </ul>
      {compact ? (
        <Button size="sm" variant="outline" asChild className="mt-3">
          <Link href={`${PREVIEW_ROOT}/options`}>{translateApprovals('m_09fc3b0327f7b4')}</Link>
        </Button>
      ) : (
        <form onSubmit={configure} className="mt-4 space-y-3">
          <h3>{translateApprovals('m_119c51fcf2a24e')}</h3>
          <Field label={translateApprovals('m_0a9242c5af12a1')}>
            <Input
              required
              minLength={1}
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={translateApprovals('m_039826700efbe2')}
            />
          </Field>
          <Field label={translateApprovals('m_0cca6d8c11db50')}>
            <Select
              aria-label={translateApprovals('m_0cca6d8c11db50')}
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
            {pending
              ? translateApprovals('m_14edc14616e78d')
              : translateApprovals('m_018376d6a359bb')}
          </Button>
          {message && (
            <p role="status">
              <GeneratedValue value={message} />
            </p>
          )}
          <p className="text-xs text-slate-500">
            {data.workflows.length} {translateApprovals('m_14b780dadeee91')}{' '}
          </p>
        </form>
      )}
      <Unavailable> {translateApprovals('m_146deade66766d')} </Unavailable>
    </Panel>
  )
}
function Reports({ data, compact = false }: { data: Data; compact?: boolean }) {
  const translateApprovals = useGeneratedTranslations()

  return (
    <Panel title={translateApprovals('m_0efecf805f86c8')} icon={BarChart3}>
      <div className="grid grid-cols-3 gap-2">
        {(['pending', 'approved', 'rejected'] as const).map((status) => (
          <Link
            href={`${PREVIEW_ROOT}/inbox?status=${status}`}
            className="approval-metric"
            key={status}
          >
            <strong>{data.requests.filter((r) => r.status === status).length}</strong>
            <span>
              <GeneratedValue value={status} />
            </span>
          </Link>
        ))}
      </div>
      <ul className="approval-checklist mt-4">
        <li>
          <CheckCircle2 size={16} /> {translateApprovals('m_1158e627065a2e')}{' '}
        </li>
        <li>
          <CheckCircle2 size={16} /> {translateApprovals('m_112834240eabfe')}{' '}
        </li>
        <li>
          <CheckCircle2 size={16} /> {translateApprovals('m_11852e86a251c2')}{' '}
        </li>
      </ul>
      {!compact && <p className="mt-3"> {translateApprovals('m_1067458b1ef3d5')} </p>}
      <Unavailable>{translateApprovals('m_0a4730a1053b41')}</Unavailable>
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
  const translateApprovals = useGeneratedTranslations()

  return (
    <div className="approvals-preview">
      <div className="approval-preview-banner">
        <span>
          <strong>{translateApprovals('m_0addc29002d5c7')}</strong>{' '}
          {translateApprovals('m_0b7005f1575578')}{' '}
        </span>
        <Link href={`${PREVIEW_ROOT}/login`}>{translateApprovals('m_1e85a4c065cb60')}</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{translateApprovals('m_03e1462c8583a3')}</h1>
          <p className="mt-1 text-sm text-slate-500">{translateApprovals('m_1d5863909b36c0')}</p>
        </div>
        <Link href={`${PREVIEW_ROOT}/guide`} className="text-xs underline underline-offset-4">
          {' '}
          {translateApprovals('m_036698954e4cc3')}{' '}
        </Link>
      </div>
      <nav aria-label={translateApprovals('m_144d6a73b12a40')} className="approval-screen-nav">
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
            {' '}
            {translateApprovals('m_024eacffc91846')}{' '}
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
          title={translateApprovals('m_024e84673ba318', {
            value0: typeof search.module === 'string' ? search.module : 'Module',
          })}
        >
          <p> {translateApprovals('m_0bba0dc780457b')} </p>
          <Button asChild className="mt-4">
            <Link href={PREVIEW_ROOT}>{translateApprovals('m_03e45907030dc3')}</Link>
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
        <span>{translateApprovals('m_0d13f3c828ae93')}</span>
        <span>{translateApprovals('m_1e92707227dbbd')}</span>
      </footer>
    </div>
  )
}

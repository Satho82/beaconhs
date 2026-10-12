import { GeneratedValue } from '@/i18n/generated'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, Select } from '@beaconhs/ui'
import { requireRequestContext } from '@/lib/auth'
import { parseListParams, isUuid } from '@/lib/list-params'
import { SearchInput } from '@/components/search-input'
import { Pagination } from '@/components/pagination'
import { productionDetail, productionDelegates } from '@/lib/approvals/production'
import { ApprovalForm } from '../../_form'

export default async function RequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const tGeneratedValue = await getGeneratedValueTranslations()

  const { id } = await params
  if (!isUuid(id)) notFound()
  const sp = await searchParams,
    ctx = await requireRequestContext()
  const lp = parseListParams(sp, {
    sort: 'created',
    dir: 'desc',
    perPage: 25,
    allowedSorts: ['created'],
  })
  const section =
    sp.section === 'documents' ? 'documents' : sp.section === 'comments' ? 'comments' : 'timeline'
  const d = await productionDetail(ctx, id, section, lp.q ?? '', lp.page)
  const r = d.request,
    f = d.financial
  const owner = r.requester_id === ctx.membership!.id,
    assigned = r.assignee_id === ctx.membership!.id && !owner
  const delegates = assigned ? await productionDelegates(ctx, id) : []
  const base = '/approvals/requests/' + id
  const initial = {
    requestId: id,
    stage: Number(r.current_stage),
    assignmentVersion: Number(r.assignment_version),
  }
  const activityLabels: Record<string, string> = {
    comment: 'Add Comment',
    cancel: 'Cancel Request',
    resubmit: 'Submit More Information',
    more_info: 'Request More Information',
    remind: 'Send Reminder',
  }
  const kinds = [
    'comment',
    ...(owner && ['pending', 'more_info'].includes(String(r.status)) ? ['cancel'] : []),
    ...(owner && r.status === 'more_info' ? ['resubmit'] : []),
    ...(assigned && r.status === 'pending' ? ['more_info'] : []),
    ...((owner || assigned) && r.status === 'pending' ? ['remind'] : []),
  ]
  return (
    <div className="space-y-6">
      <PageHeader
        title={tGeneratedValue(String(r.title))}
        description={tGeneratedValue(
          id.slice(0, 8).toUpperCase() + ' · ' + String(r.status).replace('_', ' '),
        )}
      />
      <dl className="grid gap-4 rounded-xl border p-5 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries({
          Category: f.category,
          Amount: String(f.currency ?? '') + ' ' + String(f.amount ?? ''),
          Supplier: f.supplier,
          Property: f.property_name,
          Creator: f.creator,
          'Current approver': d.currentApprover,
          Created: new Date(String(r.created_at)).toLocaleString('en-GB'),
          Stage: String(r.current_stage) + ' of ' + String(r.stage_count),
        }).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">
              <GeneratedValue value={label} />
            </dt>
            <dd className="mt-1 text-sm font-medium">
              <GeneratedValue value={String(value ?? '')} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm whitespace-pre-wrap">
        <GeneratedValue value={String(f.description ?? '')} />
      </p>
      <div className="rounded-xl border p-4">
        <h2 className="mb-2 font-semibold">
          <GeneratedValue value={'Original approval stages'} />
        </h2>
        <ol className="flex flex-wrap gap-4">
          {d.stages.map((s) => (
            <li key={String(s.position)} className="text-sm">
              <GeneratedValue value={String(s.position)} />.{' '}
              <GeneratedValue value={String(s.name)} /> —{' '}
              <GeneratedValue value={String(s.approver ?? s.approver_id)} />
            </li>
          ))}
        </ol>
      </div>
      <nav className="flex gap-3" aria-label={tGeneratedValue('Request evidence')}>
        {['timeline', 'documents', 'comments'].map((s) => (
          <Link
            key={s}
            href={base + '?section=' + s}
            className={
              'rounded-lg border px-4 py-2 text-sm capitalize ' +
              (s === section ? 'bg-teal-50 text-teal-900' : '')
            }
          >
            <GeneratedValue value={s} />
          </Link>
        ))}
      </nav>
      <SearchInput placeholder={tGeneratedValue('Search this evidence')} />
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['When', 'Who', 'Action', 'Evidence'].map((x) => (
                <th className="p-3" key={x}>
                  <GeneratedValue value={x} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((e) => (
              <tr key={String(e.id)} className="border-t">
                <td className="p-3">
                  <GeneratedValue value={new Date(String(e.occurred_at)).toLocaleString('en-GB')} />
                </td>
                <td className="p-3">
                  <GeneratedValue value={String(e.actor ?? '')} />
                </td>
                <td className="p-3">
                  <GeneratedValue value={String(e.kind)} />
                </td>
                <td className="max-w-xl p-3 whitespace-pre-wrap">
                  {section === 'documents' ? (
                    <Link
                      prefetch={false}
                      className="underline"
                      href={base + '/documents/' + String(e.id)}
                    >
                      <GeneratedValue value={String(e.body)} />
                    </Link>
                  ) : (
                    String(e.body)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!d.rows.length && (
          <p className="p-4 text-sm">
            <GeneratedValue value={'No evidence matches this search.'} />
          </p>
        )}
      </div>
      {owner &&
        r.source_module === 'financial' &&
        ['pending', 'more_info'].includes(String(r.status)) && (
          <section className="rounded-xl border p-5">
            <h2 className="mb-4 font-semibold">
              <GeneratedValue value={'Add supporting document'} />
            </h2>
            <ApprovalForm
              action="attach"
              initial={{ requestId: id }}
              label={tGeneratedValue('Upload Document')}
            >
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'PDF, JPG or PNG, maximum 10 MB'} />
                <input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png" required />
              </label>
            </ApprovalForm>
          </section>
        )}
      <Pagination basePath={base} currentParams={sp} total={d.total} page={lp.page} perPage={25} />
      <div className="grid gap-6 lg:grid-cols-2">
        {assigned && r.status === 'pending' && (
          <section className="rounded-xl border p-5">
            <h2 className="mb-4 font-semibold">
              <GeneratedValue value={'Submit Decision'} />
            </h2>
            <ApprovalForm
              action="decision"
              initial={initial}
              label={tGeneratedValue('Submit Decision')}
            >
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'Decision'} />
                <Select className="rounded border p-2" name="decision">
                  <option value="approve">{tGeneratedValue('Approve')}</option>
                  <option value="reject">{tGeneratedValue('Reject')}</option>
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'Comment (required for rejection)'} />
                <textarea className="rounded border p-2" name="reason" maxLength={4000} />
              </label>
            </ApprovalForm>
          </section>
        )}
        <section className="rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">
            <GeneratedValue value={'Request activity'} />
          </h2>
          <ApprovalForm
            action="activity"
            initial={initial}
            label={tGeneratedValue('Save Activity')}
          >
            <label className="grid gap-1 text-sm">
              <GeneratedValue value={'Action'} />
              <Select className="rounded border p-2" name="kind">
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    <GeneratedValue value={activityLabels[k]} />
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <GeneratedValue value={'Comment or reason'} />
              <textarea className="rounded border p-2" name="body" required maxLength={4000} />
            </label>
          </ApprovalForm>
        </section>
        {assigned && r.status === 'pending' && (
          <section className="rounded-xl border p-5">
            <h2 className="mb-4 font-semibold">
              <GeneratedValue value={'Delegate current stage'} />
            </h2>
            {delegates.length ? (
              <ApprovalForm
                action="activity"
                initial={{ ...initial, kind: 'delegate' }}
                label={tGeneratedValue('Delegate Approval')}
              >
                <label className="grid gap-1 text-sm">
                  <GeneratedValue value={'Authorised delegate'} />
                  <Select name="targetId" className="rounded border p-2" required>
                    <option value="">{tGeneratedValue('Select delegate')}</option>
                    {delegates.map((m) => (
                      <option key={m.id} value={m.id}>
                        <GeneratedValue value={m.name} />
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-sm">
                  <GeneratedValue value={'Reason'} />
                  <textarea className="rounded border p-2" name="body" required maxLength={4000} />
                </label>
              </ApprovalForm>
            ) : (
              <p className="text-sm">
                <GeneratedValue
                  value={'No other active member has approval authority for this property.'}
                />
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

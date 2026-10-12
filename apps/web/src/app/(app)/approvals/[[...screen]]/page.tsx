import { GeneratedValue } from '@/i18n/generated'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, Button, Select } from '@beaconhs/ui'
import { requireRequestContext } from '@/lib/auth'
import { parseListParams } from '@/lib/list-params'
import { SearchInput } from '@/components/search-input'
import { Pagination } from '@/components/pagination'
import { productionList, productionOptions } from '@/lib/approvals/production'
import { ApprovalForm, WorkflowStages } from '../_form'

const titles: Record<string, string> = {
  overview: 'Approvals Dashboard',
  my: 'My Requests',
  awaiting: 'Awaiting My Approval',
  team: 'Team Requests',
  history: 'Approval History',
  reports: 'Reporting & Exports',
  new: 'Create Approval Request',
  configure: 'Workflow Configuration',
}
const inputClass = 'rounded-lg border bg-transparent p-2'
export default async function ApprovalPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const tGeneratedValue = await getGeneratedValueTranslations()

  const { screen = [] } = await params
  const view = screen[0] ?? 'overview'
  if (screen.length > 1 || !titles[view]) notFound()
  const sp = await searchParams,
    ctx = await requireRequestContext()
  const lp = parseListParams(sp, {
    sort: 'created',
    dir: 'desc',
    perPage: 25,
    allowedSorts: ['created'],
  })
  const str = (key: string) => (typeof sp[key] === 'string' ? (sp[key] as string) : '')
  const base = view === 'overview' ? '/approvals' : '/approvals/' + view
  if (view === 'new' || view === 'configure') {
    const options = await productionOptions(ctx, view === 'configure', {
      q: lp.q ?? '',
      page: lp.page,
    })
    return (
      <div className="max-w-3xl space-y-6">
        <PageHeader title={tGeneratedValue(titles[view]!)} />
        {view === 'configure' && (
          <section className="space-y-3">
            <h2 className="font-semibold">
              <GeneratedValue value={'Configured workflows'} />
            </h2>
            <SearchInput placeholder={tGeneratedValue('Search workflows')} />
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {['Workflow name', 'Property', 'Category', 'Maximum amount', 'Stages'].map(
                      (label) => (
                        <th key={label} className="p-3">
                          <GeneratedValue value={label} />
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {options.workflows.map((w) => (
                    <tr key={String(w.id)} className="border-t">
                      <td className="p-3">
                        <GeneratedValue value={String(w.name)} />
                      </td>
                      <td className="p-3">
                        <GeneratedValue
                          value={String(
                            options.properties.find((p) => p.id === w.property_id)?.name ?? '',
                          )}
                        />
                      </td>
                      <td className="p-3">
                        <GeneratedValue value={String(w.category)} />
                      </td>
                      <td className="p-3">
                        <GeneratedValue value={String(w.currency)} />{' '}
                        <GeneratedValue value={String(w.maximum_amount)} />
                      </td>
                      <td className="p-3">
                        <GeneratedValue value={String((w.stages as unknown[]).length)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              basePath={base}
              currentParams={sp}
              total={options.workflowsTotal}
              page={lp.page}
              perPage={25}
            />
          </section>
        )}
        {view === 'new' ? (
          options.workflows.length === 0 ? (
            <p>
              <GeneratedValue
                value={
                  'No authorised production workflow is configured for your properties. Ask your Approvals configurator to create one.'
                }
              />
            </p>
          ) : (
            <ApprovalForm action="create" label={tGeneratedValue('Submit Request')}>
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'Approval workflow and related property'} />
                <Select className={inputClass} name="workflowId" required>
                  <option value="">{tGeneratedValue('Select workflow')}</option>
                  {options.workflows.map((w) => (
                    <option key={String(w.id)} value={String(w.id)}>
                      <GeneratedValue value={String(w.name)} /> —{' '}
                      <GeneratedValue
                        value={String(
                          options.properties.find((p) => p.id === w.property_id)?.name ?? '',
                        )}
                      />{' '}
                      — <GeneratedValue value={String(w.category)} /> {tGeneratedValue('— up to')}
                      <GeneratedValue value={String(w.currency)} />{' '}
                      <GeneratedValue value={String(w.maximum_amount)} />
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'Title'} />
                <input className={inputClass} name="title" required maxLength={300} />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-1 text-sm">
                  <GeneratedValue value={'Category'} />
                  <input
                    className={inputClass}
                    name="category"
                    list="approval-categories"
                    required
                    maxLength={100}
                  />
                  <datalist id="approval-categories">
                    {[...new Set(options.workflows.map((w) => String(w.category)))].map((x) => (
                      <option key={x}>
                        <GeneratedValue value={x} />
                      </option>
                    ))}
                  </datalist>
                </label>
                <label className="grid gap-1 text-sm">
                  <GeneratedValue value={'Amount'} />
                  <input
                    className={inputClass}
                    name="amount"
                    inputMode="decimal"
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <GeneratedValue value={'Currency'} />
                  <Select className={inputClass} name="currency">
                    {['GBP', 'EUR', 'USD'].map((x) => (
                      <option key={x}>
                        <GeneratedValue value={x} />
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'Supplier'} />
                <input className={inputClass} name="supplier" required maxLength={300} />
              </label>
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'Description'} />
                <textarea className={inputClass} name="description" maxLength={10000} rows={5} />
              </label>
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'Upload Document — PDF, JPG or PNG, maximum 10 MB'} />
                <input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png" required />
              </label>
              <Link href="/approvals/my" className="mr-4 underline">
                <GeneratedValue value={'Cancel'} />
              </Link>
            </ApprovalForm>
          )
        ) : (
          <ApprovalForm
            action="configure"
            label={tGeneratedValue('Create Workflow')}
            successPath="/approvals/configure"
          >
            <p className="text-sm">
              <GeneratedValue
                value={
                  'Create a new immutable workflow for future requests. Existing requests retain their original workflow and approvers.'
                }
              />
            </p>
            <label className="grid gap-1 text-sm">
              <GeneratedValue value={'Related property'} />
              <Select className={inputClass} name="propertyId" required>
                <option value="">{tGeneratedValue('Select property')}</option>
                {options.properties.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    <GeneratedValue value={String(p.name)} />
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <GeneratedValue value={'Workflow name'} />
              <input className={inputClass} name="name" required maxLength={200} />
            </label>
            <label className="grid gap-1 text-sm">
              <GeneratedValue value={'Category'} />
              <input className={inputClass} name="category" required maxLength={100} />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'Maximum amount'} />
                <input className={inputClass} name="maximumAmount" inputMode="decimal" required />
              </label>
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'Currency'} />
                <Select name="currency" className={inputClass}>
                  {['GBP', 'EUR', 'USD'].map((x) => (
                    <option key={x}>
                      <GeneratedValue value={x} />
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                <GeneratedValue value={'Reminder interval (hours)'} />
                <input
                  type="number"
                  className={inputClass}
                  name="reminderHours"
                  min={1}
                  max={720}
                  defaultValue={24}
                  required
                />
              </label>
            </div>
            <div className="flex gap-4">
              <label className="text-sm">
                <input type="checkbox" name="inAppEnabled" defaultChecked />{' '}
                <GeneratedValue value={'In-app notifications'} />
              </label>
              <label className="text-sm">
                <input type="checkbox" name="emailEnabled" />{' '}
                <GeneratedValue value={'Email notifications'} />
              </label>
            </div>
            <WorkflowStages
              roles={options.roles.map((r) => ({ id: String(r.id), name: String(r.name) }))}
              members={options.members.map((m) => ({
                id: String(m.id),
                name: String(m.display_name ?? m.id),
              }))}
            />
          </ApprovalForm>
        )}
      </div>
    )
  }
  const status = ['pending', 'approved', 'rejected', 'more_info', 'cancelled'].includes(
    str('status'),
  )
    ? str('status')
    : ''
  const data = await productionList(ctx, {
    view,
    q: lp.q ?? '',
    status,
    propertyId: str('property'),
    page: lp.page,
    perPage: 25,
  })
  const exportSearch = new URLSearchParams({
    view,
    q: lp.q ?? '',
    status,
    property: str('property'),
  }).toString()
  return (
    <div className="space-y-6">
      <PageHeader title={tGeneratedValue(titles[view]!)} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.totals.map((s, i) => (
          <div key={i} className="rounded-xl border bg-white p-4 dark:bg-slate-900">
            <p className="text-sm capitalize">
              <GeneratedValue value={String(s.status).replace('_', ' ')} />
            </p>
            <p className="mt-1 text-2xl font-semibold">
              <GeneratedValue value={String(s.total)} />
            </p>
            {Boolean(s.currency) && (
              <p className="text-sm">
                <GeneratedValue value={String(s.currency)} />{' '}
                <GeneratedValue value={String(s.amount)} />
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <SearchInput placeholder={tGeneratedValue('Search title, category or supplier')} />
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="q" value={lp.q ?? ''} />
          <Select
            aria-label={tGeneratedValue('Status')}
            className={inputClass}
            name="status"
            defaultValue={status}
          >
            <option value="">{tGeneratedValue('All statuses')}</option>
            {['pending', 'approved', 'rejected', 'more_info', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                <GeneratedValue value={s.replace('_', ' ')} />
              </option>
            ))}
          </Select>
          <Select
            aria-label={tGeneratedValue('Property')}
            name="property"
            className={inputClass}
            defaultValue={str('property')}
          >
            <option value="">{tGeneratedValue('All authorised properties')}</option>
            {data.properties.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                <GeneratedValue value={String(p.name)} />
              </option>
            ))}
          </Select>
          <Button type="submit" variant="outline">
            <GeneratedValue value={'Apply filters'} />
          </Button>
        </form>
        {view === 'reports' && (
          <Link
            prefetch={false}
            href={'/approvals/export.csv?' + exportSearch}
            className="rounded-lg border px-3 py-2"
          >
            <GeneratedValue value={'Export CSV'} />
          </Link>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-slate-50 dark:bg-slate-900">
              {['Ref', 'Title', 'Property', 'Category', 'Amount', 'Status', 'Created'].map((x) => (
                <th key={x} className="p-3">
                  <GeneratedValue value={x} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={String(r.id)} className="border-b">
                <td className="p-3">
                  <GeneratedValue value={String(r.id).slice(0, 8).toUpperCase()} />
                </td>
                <td className="p-3">
                  <Link
                    className="font-medium underline"
                    href={'/approvals/requests/' + String(r.id)}
                  >
                    <GeneratedValue value={String(r.title)} />
                  </Link>
                </td>
                <td className="p-3">
                  <GeneratedValue value={String(r.property_name)} />
                </td>
                <td className="p-3">
                  <GeneratedValue value={String(r.category ?? '')} />
                </td>
                <td className="p-3 whitespace-nowrap">
                  <GeneratedValue value={String(r.currency ?? '')} />{' '}
                  <GeneratedValue value={String(r.amount ?? '')} />
                </td>
                <td className="p-3 capitalize">
                  <GeneratedValue
                    value={
                      r.status === 'pending' && Number(r.current_stage) > 1
                        ? 'In review'
                        : String(r.status).replace('_', ' ')
                    }
                  />
                </td>
                <td className="p-3 whitespace-nowrap">
                  <GeneratedValue
                    value={new Date(String(r.created_at)).toLocaleDateString('en-GB')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length && (
          <p className="p-6 text-sm">
            <GeneratedValue value={'No requests match your authorised scope and filters.'} />
          </p>
        )}
      </div>
      <Pagination
        basePath={base}
        currentParams={sp}
        total={data.total}
        page={lp.page}
        perPage={25}
      />
    </div>
  )
}

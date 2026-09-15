import { getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { notFound } from 'next/navigation'
import type { SignoffKind } from '@/lib/hospitality/signoff-period'
import Link from 'next/link'
import { Button, EmptyState, Input, Label, PageHeader, Select } from '@beaconhs/ui'
import { can } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { listPropertySignoffs, signoffSummary } from '@/lib/hospitality/signoff'
import { confirmSignoffAction } from './actions'

export default async function SignoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>
  searchParams: Promise<{ kind?: string }>
}) {
  const translateHospitality = await getGeneratedTranslations()

  const { propertyId } = await params
  if (!isUuid(propertyId)) notFound()
  const ctx = await requireRequestContext()
  const kind: SignoffKind = (await searchParams).kind === 'monthly' ? 'monthly' : 'weekly'
  const [summary, history] = await Promise.all([
    signoffSummary(ctx, propertyId, kind),
    listPropertySignoffs(ctx, propertyId),
  ])
  const manage = can(ctx, 'hospitality.manage')
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <PageHeader
        title={translateHospitality('m_04e9edeb84cfb2')}
        description={translateHospitality('m_156586e80e666a', {
          value0: translateHospitality(kind === 'weekly' ? 'm_0f5fe94677f742' : 'm_03da3ce41e10fb'),
          value1: summary.start.toLocaleDateString(),
          value2: summary.end.toLocaleDateString(),
        })}
        actions={
          <Button asChild variant="outline">
            <Link href={`/hospitality/properties/${propertyId}/diary`}>
              {translateHospitality('m_0c49cf654fea3d')}
            </Link>
          </Button>
        }
      />
      <div className="mt-4 flex gap-2">
        <Button asChild variant={kind === 'weekly' ? 'default' : 'outline'}>
          <Link href={`/hospitality/properties/${propertyId}/signoff?kind=weekly`}>
            {translateHospitality('m_0f5fe94677f742')}
          </Link>
        </Button>
        <Button asChild variant={kind === 'monthly' ? 'default' : 'outline'}>
          <Link href={`/hospitality/properties/${propertyId}/signoff?kind=monthly`}>
            {translateHospitality('m_03da3ce41e10fb')}
          </Link>
        </Button>
      </div>
      <section className="mt-5 grid gap-3 sm:grid-cols-5">
        {Object.entries({
          Total: summary.total,
          Completed: summary.completed,
          Incomplete: summary.incomplete,
          Overdue: summary.overdue,
          Escalated: summary.escalated,
        }).map(([label, value]) => (
          <div className="rounded-lg border p-3" key={label}>
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>
      {summary.incomplete > 0 && (
        <p className="mt-4 rounded border border-amber-300 p-3 text-sm">
          {translateHospitality('m_0e447b76716e1f', {
            value0: summary.incomplete,
            value1: summary.overdue,
          })}
        </p>
      )}
      {manage && (
        <form action={confirmSignoffAction} className="mt-5 grid gap-3 rounded-lg border p-4">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="kind" value={kind} />
          <Label>
            {translateHospitality('m_0c7aee1805e7ce')}
            <Input name="comments" maxLength={4000} />
          </Label>
          <Button type="submit">
            {translateHospitality(kind === 'weekly' ? 'm_1f8b136eea780b' : 'm_0d43d276fa848b')}
          </Button>
        </form>
      )}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">{translateHospitality('m_1cc99fa21ebbaa')}</h2>
        {history.length ? (
          <div className="mt-3 grid gap-2">
            {history.map((row) => (
              <div className="rounded border p-3" key={row.id}>
                {row.kind} · {row.periodStart.toLocaleDateString()} –{' '}
                {row.periodEnd.toLocaleDateString()} {translateHospitality('m_0c745bfb66df3b')}{' '}
                {row.confirmedAt.toLocaleString()}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={translateHospitality('m_11f45f4a48ad6b')} />
        )}
      </section>
    </main>
  )
}

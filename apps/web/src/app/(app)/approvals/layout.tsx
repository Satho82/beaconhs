import { GeneratedValue } from '@/i18n/generated'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { can } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { approvalReadScope } from '@/lib/approvals/service'
import { PageContainer } from '@/components/page-layout'

export default async function ApprovalsLayout({ children }: { children: ReactNode }) {
  const tGeneratedValue = await getGeneratedValueTranslations()

  const ctx = await requireRequestContext()
  const { fresh } = await ctx.db((tx) => approvalReadScope(tx, ctx))
  const team =
    (can(ctx, 'approvals.decide') && can(fresh, 'approvals.decide')) ||
    (can(ctx, 'approvals.configure') && can(fresh, 'approvals.configure'))
  const links = [
    ['/approvals', 'Dashboard'],
    ['/approvals/my', 'My Requests'],
    ['/approvals/awaiting', 'Awaiting My Approval'],
    ...(team
      ? [
          ['/approvals/team', 'Team Requests'],
          ['/approvals/history', 'Approval History'],
          ['/approvals/reports', 'Reporting & Exports'],
        ]
      : []),
    ...(can(ctx, 'approvals.submit') && can(fresh, 'approvals.submit')
      ? [['/approvals/new', 'Create Request']]
      : []),
    ...(can(ctx, 'approvals.configure') && can(fresh, 'approvals.configure')
      ? [['/approvals/configure', 'Workflow Configuration']]
      : []),
  ]
  return (
    <PageContainer>
      <nav
        aria-label={tGeneratedValue('Approvals')}
        className="mb-6 flex flex-wrap gap-2 border-b pb-4"
      >
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href!}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-[var(--primary)] hover:text-white"
          >
            <GeneratedValue value={label} />
          </Link>
        ))}
      </nav>
      <GeneratedValue value={children} />
    </PageContainer>
  )
}

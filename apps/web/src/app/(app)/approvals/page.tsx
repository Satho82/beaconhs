import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { flowGates } from '@beaconhs/db/schema'
import { can } from '@beaconhs/tenant'
import { FlowApprovals } from '@/components/flows/flow-approvals'
import { requireRequestContext } from '@/lib/auth'

export default async function ApprovalsPage() {
  const ctx = await requireRequestContext()
  if (!can(ctx, 'approvals.read')) redirect('/dashboard')
  if (!ctx.membership?.id) redirect('/dashboard')

  const rows = await ctx.db((tx) =>
    tx
      .select({ id: flowGates.id, title: flowGates.title })
      .from(flowGates)
      .where(
        and(
          eq(flowGates.status, 'pending'),
          eq(flowGates.assigneeTenantUserId, ctx.membership!.id),
        ),
      )
      .orderBy(flowGates.createdAt),
  )

  const gates = rows.map((gate) => ({
    id: gate.id,
    title: gate.title || 'Approval',
    assigneeName: null,
    assignedToMe: true,
    canAct: true,
  }))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Approvals</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Requests assigned to you that need a decision.
        </p>
      </div>
      {gates.length > 0 ? (
        <FlowApprovals gates={gates} />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No approvals are waiting for you.
        </div>
      )}
    </div>
  )
}

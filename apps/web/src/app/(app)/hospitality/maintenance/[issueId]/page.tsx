import { and, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { PageHeader } from '@beaconhs/ui'
import { maintenanceIssues } from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan } from '@beaconhs/tenant'
export default async function IssuePage({params}:{params:Promise<{issueId:string}>}){const ctx=await requireRequestContext();await assertTenantModuleEntitled(ctx,'hospitality.maintenance');assertCan(ctx,'maintenance.read');const{issueId}=await params;const[r]=await ctx.db(tx=>tx.select().from(maintenanceIssues).where(and(eq(maintenanceIssues.tenantId,ctx.tenantId),eq(maintenanceIssues.id,issueId))).limit(1));if(!r)notFound();return <main className="mx-auto max-w-4xl p-4"><PageHeader title={r.summary} description={`${r.reference} · ${r.priority} · ${r.status}`}/><p>{r.description}</p><p>{r.resolutionNotes}</p></main>}

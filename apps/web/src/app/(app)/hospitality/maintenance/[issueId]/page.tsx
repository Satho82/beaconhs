import { and, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { Button, Input, Label, PageHeader } from '@beaconhs/ui'
import { maintenanceIssues } from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan, can } from '@beaconhs/tenant'
import { updateMaintenanceIssueAction } from '../../properties/actions'
export default async function IssuePage({params}:{params:Promise<{issueId:string}>}){const ctx=await requireRequestContext();await assertTenantModuleEntitled(ctx,'hospitality.maintenance');assertCan(ctx,'maintenance.read');const{issueId}=await params;const[r]=await ctx.db(tx=>tx.select().from(maintenanceIssues).where(and(eq(maintenanceIssues.tenantId,ctx.tenantId),eq(maintenanceIssues.id,issueId))).limit(1));if(!r)notFound();return <main className="mx-auto max-w-4xl p-4"><PageHeader title={r.summary} description={`${r.reference} · ${r.priority} · ${r.status}`}/><p>{r.description}</p>{can(ctx,'maintenance.update')&&<form action={updateMaintenanceIssueAction} className="my-4 grid gap-2 rounded border p-3"><input type="hidden" name="issueId" value={r.id}/><Label>Priority<Input name="priority" defaultValue={r.priority}/></Label><Label>Status<Input name="status" defaultValue={r.status}/></Label><Label>Resolution notes<Input name="resolutionNotes" defaultValue={r.resolutionNotes??''}/></Label><Button type="submit">Save issue</Button></form>}<p>{r.completedAt?.toISOString()}</p></main>}

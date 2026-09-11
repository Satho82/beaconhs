import { and, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button, EmptyState, PageHeader, Input, Label } from '@beaconhs/ui'
import { hospitalityBuildings, hospitalityProperties } from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan } from '@beaconhs/tenant'
import { can } from '@beaconhs/tenant'
import { createBuildingAction } from '../actions'
export default async function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
 const ctx=await requireRequestContext(); await assertTenantModuleEntitled(ctx,'hospitality.properties'); assertCan(ctx,'hospitality.read'); const {id}=await params
 const data=await ctx.db(async tx=>{const [property]=await tx.select().from(hospitalityProperties).where(and(eq(hospitalityProperties.tenantId,ctx.tenantId),eq(hospitalityProperties.id,id),isNull(hospitalityProperties.deletedAt))).limit(1); const buildings=property?await tx.select().from(hospitalityBuildings).where(and(eq(hospitalityBuildings.tenantId,ctx.tenantId),eq(hospitalityBuildings.propertyId,id),isNull(hospitalityBuildings.deletedAt))):[]; return {property,buildings}}); if(!data.property) notFound()
 const manage=can(ctx,'hospitality.manage'); return <main className="mx-auto max-w-5xl p-4 sm:p-6"><PageHeader title={data.property.name} description={`${data.property.code} · ${data.property.timezone}`} action={<Button asChild><Link href="/hospitality/properties">All properties</Link></Button>}/><section className="mt-5"><h2 className="text-lg font-semibold">Buildings and wings</h2>{manage&&<form action={createBuildingAction} className="mt-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-3"><input type="hidden" name="propertyId" value={data.property.id}/><Label>Name<Input name="name" required maxLength={200}/></Label><Label>Code<Input name="code" required maxLength={80}/></Label><Button type="submit">Add Building/Wing</Button></form>}{data.buildings.length===0?<EmptyState title="No buildings or wings" description="Add a building or wing to continue the hierarchy."/>:<div className="mt-3 grid gap-3 sm:grid-cols-2">{data.buildings.map(b=><Link className="rounded-lg border p-4" href={`/hospitality/properties/${data.property.id}/buildings/${b.id}`} key={b.id}><strong>{b.name}</strong><p className="text-sm text-muted-foreground">{b.code}</p></Link>)}</div>}</section></main>
}

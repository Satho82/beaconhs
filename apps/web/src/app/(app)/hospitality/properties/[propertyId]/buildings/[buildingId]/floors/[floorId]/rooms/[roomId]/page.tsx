import { and, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { Button, Input, Label, PageHeader } from '@beaconhs/ui'
import { hospitalityRooms } from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan, can } from '@beaconhs/tenant'
import { updateRoomAction } from '../../../../../../actions'
export default async function RoomPage({params}:{params:Promise<{propertyId:string;buildingId:string;floorId:string;roomId:string}>}){const ctx=await requireRequestContext();await assertTenantModuleEntitled(ctx,'hospitality.properties');assertCan(ctx,'hospitality.read');const p=await params;const[row]=await ctx.db(tx=>tx.select().from(hospitalityRooms).where(and(eq(hospitalityRooms.tenantId,ctx.tenantId),eq(hospitalityRooms.id,p.roomId),eq(hospitalityRooms.floorId,p.floorId),isNull(hospitalityRooms.deletedAt))).limit(1));if(!row)notFound();return <main className="mx-auto max-w-5xl p-4"><PageHeader title={row.name||row.code} description={`${row.roomType??'room'} · ${row.status}`}/>{can(ctx,'hospitality.manage')&&<form action={updateRoomAction} className="my-4 grid gap-2 rounded border p-3 sm:grid-cols-3"><input type="hidden" name="propertyId" value={p.propertyId}/><input type="hidden" name="buildingId" value={p.buildingId}/><input type="hidden" name="floorId" value={p.floorId}/><input type="hidden" name="roomId" value={p.roomId}/><Label>Number<Input name="code" defaultValue={row.code} required/></Label><Label>Name<Input name="name" defaultValue={row.name??''}/></Label><Label>Type<Input name="roomType" defaultValue={row.roomType??''}/></Label><Button type="submit">Save changes</Button></form>}</main>}

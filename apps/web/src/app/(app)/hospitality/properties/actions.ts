'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRequestContext } from '@/lib/auth'
import { createProperty, createBuilding, createFloor, createRoom, archiveProperty } from '@/lib/hospitality/properties'
import { updateBuilding } from '@/lib/hospitality/properties'
import { updateFloor } from '@/lib/hospitality/properties'
import { updateRoom } from '@/lib/hospitality/properties'
import { createRoomMaintenanceIssue } from '@/lib/hospitality/maintenance'
import { updateMaintenanceIssue } from '@/lib/hospitality/maintenance'
const value = (f: FormData, key: string) => String(f.get(key) ?? '')
export async function createPropertyAction(f: FormData) { const ctx = await requireRequestContext(); await createProperty(ctx,{name:value(f,'name'),code:value(f,'code'),timezone:value(f,'timezone')}); revalidatePath('/hospitality/properties') }
export async function createBuildingAction(f: FormData) { const ctx = await requireRequestContext(); const [row]=await createBuilding(ctx,value(f,'propertyId'),value(f,'name'),value(f,'code')); if(!row) throw new Error('Building creation failed'); revalidatePath(`/hospitality/properties/${row.propertyId}`); redirect(`/hospitality/properties/${row.propertyId}/buildings/${row.id}`) }
export async function createFloorAction(f: FormData) { const ctx = await requireRequestContext(); const [r]=await createFloor(ctx,value(f,'buildingId'),value(f,'name'),value(f,'code')); if(!r)throw new Error('Floor creation failed');redirect(`/hospitality/properties/${value(f,'propertyId')}/buildings/${r.buildingId}/floors/${r.id}`) }
export async function createRoomAction(f: FormData) { const ctx = await requireRequestContext();const[r]=await createRoom(ctx,value(f,'floorId'),value(f,'code'),value(f,'name'),value(f,'roomType'));if(!r)throw new Error('Room creation failed');redirect(`/hospitality/properties/${value(f,'propertyId')}/buildings/${value(f,'buildingId')}/floors/${r.floorId}/rooms/${r.id}`) }
export async function archivePropertyAction(f: FormData) { const ctx = await requireRequestContext(); await archiveProperty(ctx,value(f,'id')); revalidatePath('/hospitality/properties') }
export async function updateBuildingAction(f: FormData) { const ctx=await requireRequestContext(); const row=await updateBuilding(ctx,value(f,'propertyId'),value(f,'buildingId'),value(f,'name'),value(f,'code')); revalidatePath(`/hospitality/properties/${row.propertyId}/buildings/${row.id}`); redirect(`/hospitality/properties/${row.propertyId}/buildings/${row.id}`) }
export async function updateFloorAction(f:FormData){const ctx=await requireRequestContext();const r=await updateFloor(ctx,value(f,'buildingId'),value(f,'floorId'),value(f,'name'),value(f,'code'));redirect(`/hospitality/properties/${value(f,'propertyId')}/buildings/${r.buildingId}/floors/${r.id}`)}
export async function updateRoomAction(f:FormData){const ctx=await requireRequestContext();const r=await updateRoom(ctx,value(f,'floorId'),value(f,'roomId'),value(f,'code'),value(f,'name'),value(f,'roomType'));redirect(`/hospitality/properties/${value(f,'propertyId')}/buildings/${value(f,'buildingId')}/floors/${r.floorId}/rooms/${r.id}`)}
export async function reportMaintenanceIssueAction(f:FormData){const ctx=await requireRequestContext();const r=await createRoomMaintenanceIssue(ctx,value(f,'roomId'),value(f,'title'),value(f,'description'),value(f,'priority'));redirect(`/hospitality/maintenance/${r.id}`)}
export async function updateMaintenanceIssueAction(f:FormData){const ctx=await requireRequestContext();const r=await updateMaintenanceIssue(ctx,value(f,'issueId'),value(f,'priority'),value(f,'status'),value(f,'resolutionNotes'));redirect(`/hospitality/maintenance/${r.id}`)}

'use server'
import { revalidatePath } from 'next/cache'
import { requireRequestContext } from '@/lib/auth'
import { createProperty, createBuilding, createFloor, createRoom, archiveProperty } from '@/lib/hospitality/properties'
const value = (f: FormData, key: string) => String(f.get(key) ?? '')
export async function createPropertyAction(f: FormData) { const ctx = await requireRequestContext(); await createProperty(ctx,{name:value(f,'name'),code:value(f,'code'),timezone:value(f,'timezone')}); revalidatePath('/hospitality/properties') }
export async function createBuildingAction(f: FormData) { const ctx = await requireRequestContext(); await createBuilding(ctx,value(f,'propertyId'),value(f,'name'),value(f,'code')); revalidatePath('/hospitality/properties') }
export async function createFloorAction(f: FormData) { const ctx = await requireRequestContext(); await createFloor(ctx,value(f,'buildingId'),value(f,'name'),value(f,'code')); revalidatePath('/hospitality/properties') }
export async function createRoomAction(f: FormData) { const ctx = await requireRequestContext(); await createRoom(ctx,value(f,'floorId'),value(f,'code'),value(f,'name'),value(f,'roomType')); revalidatePath('/hospitality/properties') }
export async function archivePropertyAction(f: FormData) { const ctx = await requireRequestContext(); await archiveProperty(ctx,value(f,'id')); revalidatePath('/hospitality/properties') }

'use server'
import { revalidatePath } from 'next/cache'
import { requireRequestContext } from '@/lib/auth'
import { confirmSignoff } from '@/lib/hospitality/signoff'
export async function confirmSignoffAction(form: FormData) { const propertyId=String(form.get('propertyId')??''); const kind=String(form.get('kind')??''); if(kind!=='weekly'&&kind!=='monthly') throw new Error('Invalid sign-off period.'); const ctx=await requireRequestContext(); await confirmSignoff(ctx,propertyId,kind,String(form.get('comments')??'')); revalidatePath(`/hospitality/properties/${propertyId}/signoff`) }

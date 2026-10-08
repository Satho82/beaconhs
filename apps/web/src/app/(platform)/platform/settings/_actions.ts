'use server'
import { revalidatePath } from 'next/cache'
import { requirePlatformOperator } from '@/lib/auth'
import { getPlatformBranding, savePlatformBranding } from '@/lib/platform-branding-config'
import { recordPlatformAudit } from '@/lib/platform-audit'

export async function savePlatformIdentity(data: FormData) {
  const operator = await requirePlatformOperator()
  const productName = String(data.get('productName') ?? '').trim()
  const primaryColor = String(data.get('primaryColor') ?? '').trim()
  if (!productName || productName.length > 100)
    throw new Error('Enter a platform name of 1–100 characters.')
  if (primaryColor && !/^#[0-9a-f]{6}$/i.test(primaryColor))
    throw new Error('Enter a six-digit HEX colour.')
  const previous = await getPlatformBranding()
  await savePlatformBranding({ ...previous, productName, primaryColor })
  await recordPlatformAudit(operator, {
    entityType: 'platform-branding',
    action: 'update',
    summary: 'Platform identity and default primary colour updated',
  })
  revalidatePath('/', 'layout')
}

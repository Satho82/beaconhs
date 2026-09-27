import 'server-only'

import { randomUUID } from 'node:crypto'
import { deleteObject, ensureBucket, getObject, putObject } from '@beaconhs/storage'
import { isPlatformBrandAssetKey, type PlatformBrandAssetKind } from './platform-brand-asset-url'
import { validatePlatformBrandAsset } from './platform-brand-asset-validation'

function extension(contentType: string) {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'image/x-icon' || contentType === 'image/vnd.microsoft.icon') return 'ico'
  return 'png'
}

export async function storePlatformBrandAsset(args: {
  kind: PlatformBrandAssetKind
  contentType: string
  bytes: Uint8Array
}): Promise<string> {
  const error = validatePlatformBrandAsset(args)
  if (error) throw new Error(error)
  const key = `platform/branding/${args.kind}/${randomUUID()}.${extension(args.contentType)}`
  await ensureBucket()
  await putObject({
    key,
    body: args.bytes,
    contentType: args.contentType,
    contentDisposition: 'inline',
  })
  return key
}

export async function deletePlatformBrandAsset(key: string | undefined): Promise<void> {
  if (!isPlatformBrandAssetKey(key)) return
  await deleteObject({ key })
}

export async function readPlatformBrandAsset(key: string | undefined): Promise<Buffer | null> {
  if (!isPlatformBrandAssetKey(key)) return null
  try {
    return await getObject({ key })
  } catch {
    return null
  }
}

import 'server-only'

import { randomUUID } from 'node:crypto'
import { deleteObject, ensureBucket, getObject, putObject } from '@beaconhs/storage'
import { isTenantBrandAssetKey, type TenantBrandAssetKind } from './tenant-brand-asset-url'
import { validatePlatformBrandAsset } from './platform-brand-asset-validation'

const PDF = 'application/pdf'
const MAX_LETTERHEAD_BYTES = 5 * 1024 * 1024

export async function storeTenantBrandAsset(args: {
  tenantId: string
  kind: 'logo' | 'letterhead'
  contentType: string
  bytes: Uint8Array
}) {
  if (args.kind === 'logo') {
    const error = validatePlatformBrandAsset({
      kind: 'logo',
      contentType: args.contentType,
      bytes: args.bytes,
    })
    if (error) throw new Error(error)
  } else if (
    args.contentType.toLowerCase().split(';', 1)[0] !== PDF ||
    args.bytes.byteLength > MAX_LETTERHEAD_BYTES ||
    Buffer.from(args.bytes.subarray(0, 5)).toString() !== '%PDF-'
  ) {
    throw new Error('Letterhead must be a PDF no larger than 5 MB.')
  }
  const extension =
    args.kind === 'letterhead'
      ? 'pdf'
      : args.contentType.includes('jpeg')
        ? 'jpg'
        : args.contentType.includes('webp')
          ? 'webp'
          : 'png'
  const key = `tenants/${args.tenantId}/branding/${args.kind}/${randomUUID()}.${extension}`
  await ensureBucket()
  await putObject({
    key,
    body: args.bytes,
    contentType: args.contentType,
    contentDisposition: 'inline',
  })
  return key
}

export async function deleteTenantBrandAsset(tenantId: string, key: string | undefined) {
  if (!isTenantBrandAssetKey(tenantId, key)) return
  await deleteObject({ key })
}

/** Storage access stays server-only; callers must derive the target tenant. */
export async function readTenantBrandAsset(
  tenantId: string,
  kind: TenantBrandAssetKind,
  key: string | undefined,
): Promise<Buffer | null> {
  if (!isTenantBrandAssetKey(tenantId, key, kind)) return null
  try {
    return await getObject({ key })
  } catch {
    return null
  }
}

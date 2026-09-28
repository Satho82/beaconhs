import { isUuid } from './list-params'

export type TenantBrandAssetKind = 'logo' | 'letterhead'

const KEY = /^tenants\/([^/]+)\/branding\/(logo|letterhead)\/([^/]+)\.(png|jpg|webp|pdf)$/i

export function isTenantBrandAssetKey(
  tenantId: string,
  key: string | undefined,
  expectedKind?: TenantBrandAssetKind,
): key is string {
  const match = key?.match(KEY)
  if (!match) return false
  const [, keyTenantId, kind, assetId, extension] = match
  if (!isUuid(tenantId) || !isUuid(keyTenantId!) || !isUuid(assetId!)) return false
  if (keyTenantId?.toLowerCase() !== tenantId.toLowerCase()) return false
  if (expectedKind && kind !== expectedKind) return false
  const normalizedExtension = extension?.toLowerCase()
  return kind === 'letterhead'
    ? normalizedExtension === 'pdf'
    : ['png', 'jpg', 'webp'].includes(normalizedExtension!)
}

/** Pure same-origin URL construction; storage keys are never sent to the browser. */
export function tenantBrandAssetUrl(tenantId: string, kind: TenantBrandAssetKind): string {
  return `/platform/tenants/${encodeURIComponent(tenantId)}/branding/${kind}`
}

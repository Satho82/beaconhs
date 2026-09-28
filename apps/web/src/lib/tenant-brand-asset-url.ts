export type TenantBrandAssetKind = 'logo' | 'letterhead'

const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'
const KEY = new RegExp(
  `^tenants/(${UUID})/branding/(logo|letterhead)/(${UUID})\\.(png|jpg|webp|pdf)$`,
  'i',
)

export function isTenantBrandAssetKey(
  tenantId: string,
  key: string | undefined,
  expectedKind?: TenantBrandAssetKind,
): key is string {
  const match = key?.match(KEY)
  if (!match) return false
  const [, keyTenantId, kind, , extension] = match
  if (keyTenantId?.toLowerCase() !== tenantId.toLowerCase()) return false
  if (expectedKind && kind !== expectedKind) return false
  return kind === 'letterhead' ? extension === 'pdf' : ['png', 'jpg', 'webp'].includes(extension!)
}

/** Pure same-origin URL construction; storage keys are never sent to the browser. */
export function tenantBrandAssetUrl(tenantId: string, kind: TenantBrandAssetKind): string {
  return `/platform/tenants/${encodeURIComponent(tenantId)}/branding/${kind}`
}

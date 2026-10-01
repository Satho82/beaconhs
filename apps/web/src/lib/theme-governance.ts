export const UVANOO_PLATFORM_PRIMARY = '#0f766e'

const HEX = /^#[0-9a-f]{6}$/i

export function normalizeThemeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const color = value.trim()
  return HEX.test(color) ? color.toUpperCase() : undefined
}

/** Platform default → permitted tenant override. Tenant data never writes platform branding. */
export function resolveTenantPrimaryAction(
  platformPrimary: unknown,
  tenantPrimary: unknown,
): string {
  return (
    normalizeThemeColor(tenantPrimary) ??
    normalizeThemeColor(platformPrimary) ??
    UVANOO_PLATFORM_PRIMARY.toUpperCase()
  )
}

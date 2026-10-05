type TenantBrandingOutcome =
  'saved' | 'invalid_tenant' | 'invalid_hex' | 'invalid_asset' | 'save_failed'
export type TenantBrandingFormState = {
  status: 'idle' | 'success' | 'error'
  outcome?: TenantBrandingOutcome
}

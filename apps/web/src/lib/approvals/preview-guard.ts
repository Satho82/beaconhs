/** Fail closed unless every value identifies the isolated localhost fixture. */
export function isLocalApprovalsPreview(config: {
  mode?: string
  enabled?: string
  host: string | null
  databaseUrl?: string
}) {
  try {
    const url = new URL(config.databaseUrl ?? '')
    return (
      config.mode === 'development' &&
      config.enabled === '1' &&
      config.host === 'localhost:3103' &&
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname === '127.0.0.1' &&
      url.pathname === '/reconcile_fixture' &&
      url.username === 'beaconhs_app'
    )
  } catch {
    return false
  }
}

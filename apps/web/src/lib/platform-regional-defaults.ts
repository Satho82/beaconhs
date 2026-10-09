import 'server-only'
import { eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { platformSettings, PLATFORM_SETTINGS_ID } from '@beaconhs/db/schema'
import {
  DEFAULT_TENANT_OPERATIONAL_DEFAULTS,
  parseTenantOperationalDefaults,
} from './tenant-operational-defaults'

/** Applied by tenant creation only; saving never rewrites existing tenant settings. */
export async function getPlatformRegionalDefaults() {
  const [row] = await withSuperAdmin(db, (tx) =>
    tx
      .select({ defaults: platformSettings.regionalDefaults })
      .from(platformSettings)
      .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
      .limit(1),
  )
  return parseTenantOperationalDefaults({
    ...DEFAULT_TENANT_OPERATIONAL_DEFAULTS,
    ...row?.defaults,
  })
}

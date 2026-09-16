import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import {
  getPlatformBranding as getRuntimePlatformBranding,
  savePlatformBranding,
  type PlatformBranding,
} from '@beaconhs/auth/platform-branding'

export { getRuntimePlatformBranding as getPlatformBranding, savePlatformBranding }
export type { PlatformBranding }

/**
 * Next prerenders the root error shell during `next build`. Platform branding is
 * runtime configuration, so that shell uses the product defaults rather than
 * materialising the privileged database client in the build process.
 */
export async function getRootPlatformBranding(): Promise<PlatformBranding> {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return {}
  return getRuntimePlatformBranding()
}

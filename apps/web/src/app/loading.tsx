import { BrandSplash } from '@/components/brand-logo'
import { SplashHold } from '@/components/brand-splash'
import { getPlatformBranding } from '@/lib/platform-branding-config'

// Root route-loading fallback. The visible splash is the <SplashScreen />
// overlay in the root layout (which enforces a minimum duration so the
// draw-in always completes); SplashHold keeps it up while content streams.
// BrandSplash here just covers the frame before the hold takes effect.
export default async function Loading() {
  const branding = await getPlatformBranding()
  return (
    <>
      <SplashHold />
      <BrandSplash branding={branding} />
    </>
  )
}

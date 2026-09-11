import { LogoMark } from '@/components/brand-logo'
import { getPlatformBranding } from '@/lib/platform-branding-config'

// In-shell loading fallback for routes without their own skeleton: the
// lighthouse draws itself in, the lamp ignites, and the beacon sweeps while
// the page streams in.
export default async function Loading() {
  const branding = await getPlatformBranding()
  return (
    <div className="grid h-full min-h-[60vh] place-items-center">
      <LogoMark draw className="h-12 w-auto opacity-90" branding={branding} />
    </div>
  )
}

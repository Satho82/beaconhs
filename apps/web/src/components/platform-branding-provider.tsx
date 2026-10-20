'use client'

import { createContext, useContext } from 'react'
import type { PlatformBranding } from '@/lib/platform-branding-config'

const PlatformBrandingContext = createContext<PlatformBranding | undefined>(undefined)

export function PlatformBrandingProvider({
  branding,
  children,
}: {
  branding: PlatformBranding
  children: React.ReactNode
}) {
  return <PlatformBrandingContext.Provider value={branding}>{children}</PlatformBrandingContext.Provider>
}

export function usePlatformBranding(): PlatformBranding | undefined {
  return useContext(PlatformBrandingContext)
}

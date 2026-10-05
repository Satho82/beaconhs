'use client'
import { GeneratedValue } from '@/i18n/generated'

/**
 * Stable content wrappers without decorative entrance motion used by the (otherwise server) page
 * layouts. We keep these in their own file so server components can mark
 * just the header / body regions as interactive without forcing the whole
 * layout tree into a Client Component.
 */

import * as React from 'react'
import { cn } from '@beaconhs/ui'

export function FadeInHeader({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(className)}>
      <GeneratedValue value={children} />
    </div>
  )
}

export function FadeInBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('h-full', className)}>
      <GeneratedValue value={children} />
    </div>
  )
}

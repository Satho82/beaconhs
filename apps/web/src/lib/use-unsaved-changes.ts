'use client'
import { useGeneratedValueTranslations } from '@/i18n/generated'
import { useEffect } from 'react'
/** Guard full unload and user-initiated links without replacing router behavior. */
export function useUnsavedChanges(dirty: boolean) {
  const translateValue = useGeneratedValueTranslations()
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null
      if (
        !link ||
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        event.metaKey ||
        event.ctrlKey
      )
        return
      const next = new URL(link.href, location.href)
      if (next.pathname === location.pathname && next.search === location.search) return
      if (!window.confirm(translateValue('Discard unsaved changes and leave this page?'))) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', navigate, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', navigate, true)
    }
  }, [dirty, translateValue])
}

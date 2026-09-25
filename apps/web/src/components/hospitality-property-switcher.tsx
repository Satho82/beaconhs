'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { Popover } from '@beaconhs/ui'
import { toast } from '@/lib/toast'
import { setActiveHospitalityProperty } from '@/lib/hospitality/property-context-actions'
import { useGeneratedTranslations } from '@/i18n/generated'

export function HospitalityPropertySwitcher({
  activePropertyId,
  properties,
}: {
  activePropertyId: string | null
  properties: { id: string; name: string }[]
}) {
  const router = useRouter()
  const t = useGeneratedTranslations()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const activeName = properties.find((property) => property.id === activePropertyId)?.name
  const label = activeName ?? t('m_045c15c009ddc0')

  function pick(propertyId: string | null) {
    if (propertyId === activePropertyId) return setOpen(false)
    start(async () => {
      const result = await setActiveHospitalityProperty(propertyId)
      if (!result.ok) {
        toast.error(result.error ?? t('m_1eef6c59affd60'))
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  if (properties.length === 0) return null
  if (properties.length === 1) {
    return (
      <span className="hidden min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-700 md:flex dark:text-slate-200">
        <Building2 size={14} />
        <span className="truncate">{properties[0]?.name}</span>
      </span>
    )
  }
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-64"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={pending}
          className="hidden min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 md:flex dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/60"
        >
          <Building2 size={14} />
          <span className="truncate">{pending ? t('m_0bec5451fa832e') : label}</span>
          <ChevronDown size={14} className="text-slate-400" />
        </button>
      }
    >
      <div className="border-b border-slate-100 px-3 py-2 text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800">
        {t('m_0f7a8c3e57d104')}
      </div>
      <ul className="py-1">
        <li>
          <button
            type="button"
            onClick={() => pick(null)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
          >
            <span>{t('m_045c15c009ddc0')}</span>
            {activePropertyId === null && <Check size={14} className="text-teal-700" />}
          </button>
        </li>
        {properties.map((property) => (
          <li key={property.id}>
            <button
              type="button"
              onClick={() => pick(property.id)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <span>{property.name}</span>
              {activePropertyId === property.id && <Check size={14} className="text-teal-700" />}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  )
}

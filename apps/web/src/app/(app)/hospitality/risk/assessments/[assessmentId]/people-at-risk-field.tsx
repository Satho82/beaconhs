'use client'

import { useState } from 'react'
import { useGeneratedTranslations, useGeneratedValueTranslations } from '@/i18n/generated'

export const HOSPITALITY_PEOPLE_AT_RISK = [
  'Employees',
  'Agency and temporary staff',
  'Contractors',
  'Guests',
  'Children',
  'Visitors',
  'Delivery drivers',
  'Housekeeping staff',
  'Kitchen and food service staff',
  'Maintenance staff',
  'Security staff',
  'Lone workers',
  'People with reduced mobility',
  'People with sensory impairments',
  'New and expectant mothers',
] as const

export function PeopleAtRiskField({
  value,
  onChange,
  disabled,
}: {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}) {
  const translateValue = useGeneratedValueTranslations()
  const translateMessage = useGeneratedTranslations()
  const [customInput, setCustomInput] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const standardValues = new Set<string>(HOSPITALITY_PEOPLE_AT_RISK)
  const customValues = value.filter((item) => !standardValues.has(item))

  function toggle(item: string, checked: boolean) {
    onChange(checked ? [...new Set([...value, item])] : value.filter((entry) => entry !== item))
  }

  function addCustom() {
    const item = customInput.trim()
    if (!item) return
    onChange([...new Set([...value, item])])
    setCustomInput('')
    setCustomOpen(true)
  }

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-sm font-medium">{translateValue('People at risk')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {HOSPITALITY_PEOPLE_AT_RISK.map((item) => (
          <label key={item} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.includes(item)}
              onChange={(event) => toggle(item, event.target.checked)}
            />
            {item}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={customOpen || customValues.length > 0}
            onChange={(event) => setCustomOpen(event.target.checked)}
          />{' '}
          {translateValue('Other / Custom')}
        </label>
      </div>
      {(customOpen || customValues.length > 0) && (
        <div className="space-y-2 rounded-md border p-3">
          <label className="block text-sm">
            {translateValue('Add a custom group')}{' '}
            <span className="mt-1 flex gap-2">
              <input
                className="bg-background min-w-0 flex-1 rounded-md border px-3 py-2"
                value={customInput}
                onChange={(event) => setCustomInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addCustom()
                  }
                }}
                placeholder={translateValue('Enter a person or group')}
              />
              <button
                type="button"
                className="rounded-md border px-3 py-2"
                onClick={addCustom}
                disabled={!customInput.trim()}
              >
                {translateValue('Add')}
              </button>
            </span>
          </label>
          {customValues.length > 0 && (
            <ul
              className="flex flex-wrap gap-2"
              aria-label={translateValue('Custom people at risk')}
            >
              {customValues.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                >
                  <span>{item}</span>
                  <button
                    type="button"
                    aria-label={translateMessage('m_101f98a70352fa', { value0: item })}
                    onClick={() => toggle(item, false)}
                  >
                    {translateValue('×')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  )
}

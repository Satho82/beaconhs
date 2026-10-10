// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PeopleAtRiskField } from '@/app/(app)/hospitality/risk/assessments/[assessmentId]/people-at-risk-field'

vi.mock('@/i18n/generated', () => ({
  useGeneratedValueTranslations: () => (value: string) => value,
  useGeneratedTranslations: () => (_key: string, values: { value0: string }) =>
    `Remove ${values.value0}`,
}))

let host: HTMLDivElement
let root: Root

function Harness() {
  const [value, setValue] = useState(['Existing custom group'])
  return <PeopleAtRiskField value={value} onChange={setValue} />
}

function inputFor(labelText: string): HTMLInputElement {
  const label = [...document.querySelectorAll('label')].find((item) =>
    item.textContent?.includes(labelText),
  )
  const input = label?.querySelector('input')
  if (!(input instanceof HTMLInputElement)) throw new Error(`Input not found: ${labelText}`)
  return input
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
})

describe('People at risk field', () => {
  it('offers hospitality groups and preserves legacy custom values while editing', async () => {
    await act(() => root.render(<Harness />))
    expect(host.textContent).toContain('Guests')
    expect(host.textContent).toContain('Contractors')
    expect(host.textContent).toContain('Other / Custom')
    expect(host.textContent).toContain('Existing custom group')
    expect(inputFor('Guests').checked).toBe(false)
  })

  it('adds a selected hospitality group and a user-entered custom value', async () => {
    await act(() => root.render(<Harness />))
    await act(() => inputFor('Guests').click())
    expect(host.textContent).toContain('Existing custom group')
    expect(inputFor('Guests').checked).toBe(true)

    await act(() => inputFor('Other / Custom').click())
    const custom = host.querySelector('input[placeholder="Enter a person or group"]')
    if (!(custom instanceof HTMLInputElement)) throw new Error('Custom input not found')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(() => {
      setter?.call(custom, 'Event stewards')
      custom.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const add = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Add')
    if (!add) throw new Error('Add button not found')
    await act(() => add.click())
    expect(host.textContent).toContain('Event stewards')
    expect(inputFor('Guests').checked).toBe(true)
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/generated', () => ({ useGeneratedValueTranslations: () => (s: string) => s }))
vi.mock('@/components/file-upload', () => ({ FileUpload: () => null }))
vi.mock('@/app/(app)/hospitality/properties/actions', () => ({
  reportMaintenanceIssueAction: vi.fn(),
}))
import { QuickMaintenanceForm } from './quick-maintenance-form'

const properties = [
  { id: 'fenchurch', name: 'One Fifty Fenchurch' },
  { id: 'lincoln', name: 'The Lincoln Suites' },
]
const rooms = [
  { id: 'off-304', propertyId: 'fenchurch', label: 'Room 304' },
  { id: 'tls-304', propertyId: 'lincoln', label: 'Room 304' },
]
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
describe('Front Office maintenance presentation', () => {
  it('shows the single authorised hotel and preserves the submitted location/source', async () => {
    await act(() =>
      root.render(<QuickMaintenanceForm properties={[properties[0]!]} rooms={rooms} />),
    )
    expect(host.textContent).toContain('One Fifty Fenchurch')
    const room = host.querySelector<HTMLSelectElement>('[name="roomId"]')!
    expect([...room.options].map((o) => o.value)).toEqual(['', 'off-304'])
    room.value = 'off-304'
    host.querySelector<HTMLInputElement>('[name="title"]')!.value = 'AC not working in Room 304'
    const form = host.querySelector('form')!
    expect(form.checkValidity()).toBe(true)
    const payload = new FormData(form)
    expect(payload.get('propertyId')).toBe('fenchurch')
    expect(payload.get('roomId')).toBe('off-304')
    expect(payload.get('source')).toBe('front_office')
    expect(payload.get('priority')).toBe('medium')
    expect(payload.get('title')).toBe('AC not working in Room 304')
  })
  it('requires a property and only offers its rooms after selection', async () => {
    await act(() => root.render(<QuickMaintenanceForm properties={properties} rooms={rooms} />))
    const room = host.querySelector<HTMLSelectElement>('[name="roomId"]')!
    expect(room.disabled).toBe(true)
    expect(host.querySelector('form')!.checkValidity()).toBe(false)
    const property = host.querySelector<HTMLSelectElement>('[name="propertyId"]')!
    await act(() => {
      property.value = 'lincoln'
      property.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(room.disabled).toBe(false)
    expect([...room.options].map((o) => o.value)).toEqual(['', 'tls-304'])
    expect(host.querySelectorAll('button[type="submit"]')).toHaveLength(1)
  })
})

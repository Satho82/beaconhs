// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/use-unsaved-changes', () => ({ useUnsavedChanges: vi.fn() }))
vi.mock('@/i18n/generated', () => ({
  GeneratedValue: ({ value }: { value: React.ReactNode }) => value,
  useGeneratedValueTranslations: () => (value: string) => value,
  useGeneratedTranslations: () => (value: string) => value,
}))
import { TenantBrandingForm } from './tenant-branding-form'
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const save = vi.fn().mockResolvedValue({ status: 'success', outcome: 'saved' })
async function render() {
  await act(() =>
    root.render(
      <TenantBrandingForm
        tenantId="tenant"
        tenantName="Sample tenant"
        saveAction={save}
        primaryColor="#123456"
        hasLogo
        logoUrl="/tenant-logo"
        platformPrimaryColor="#ABCDEF"
        platformLogoUrl="/platform-logo"
      />,
    ),
  )
}
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((item) => item.textContent === label)!
it('switches preview modes and restores saved identity on Discard', async () => {
  await render()
  expect(button('Desktop').getAttribute('aria-pressed')).toBe('true')
  await act(() => button('Mobile').click())
  expect(button('Mobile').getAttribute('aria-pressed')).toBe('true')
  await act(() => button('Reset to Default').click())
  expect((host.querySelector('[name="primaryColor"]') as HTMLInputElement).value).toBe('')
  expect((host.querySelector('[name="resetLogo"]') as HTMLInputElement).checked).toBe(true)
  expect(
    host.querySelector('[aria-label="Tenant identity preview"] img')?.getAttribute('src'),
  ).toBe('/platform-logo')
  await act(() => button('Discard').click())
  expect((host.querySelector('[name="primaryColor"]') as HTMLInputElement).value).toBe('#123456')
  expect((host.querySelector('[name="resetLogo"]') as HTMLInputElement).checked).toBe(false)
  expect(
    host.querySelector('[aria-label="Tenant identity preview"] img')?.getAttribute('src'),
  ).toBe('/tenant-logo')
})
it('keeps unsupported branding fields out of the persistence form', async () => {
  await render()
  expect(host.querySelector('[name="accentColor"]')).toBeNull()
  expect(host.querySelector('[name="emailBranding"]')).toBeNull()
  expect((host.querySelector('[name="logo"]') as HTMLInputElement).accept).toBe(
    'image/png,image/jpeg,image/webp',
  )
  expect((host.querySelector('[name="letterhead"]') as HTMLInputElement).accept).toBe(
    'application/pdf',
  )
  expect((button('Save branding') as HTMLButtonElement).disabled).toBe(true)
})

it('replaces a reset logo with a valid upload up to the existing server size limit', async () => {
  const createObjectURL = vi.fn().mockReturnValue('blob:replacement-logo')
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }))
  await render()
  await act(() => button('Reset to Default').click())
  const file = new File([new Uint8Array(2_050_000)], 'replacement.png', { type: 'image/png' })
  const input = host.querySelector('[name="logo"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: { item: () => file } })
  await act(() => input.dispatchEvent(new Event('change', { bubbles: true })))
  expect(createObjectURL).toHaveBeenCalledWith(file)
  expect((host.querySelector('[name="resetLogo"]') as HTMLInputElement).checked).toBe(false)
  expect(new FormData(host.querySelector('form')!).has('resetLogo')).toBe(false)
  expect(
    host.querySelector('[aria-label="Tenant identity preview"] img')?.getAttribute('src'),
  ).toBe('blob:replacement-logo')
  await act(() => button('Discard').click())
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:replacement-logo')
  expect(
    host.querySelector('[aria-label="Tenant identity preview"] img')?.getAttribute('src'),
  ).toBe('/tenant-logo')
})

it('resets only the primary colour and restores it on Discard', async () => {
  await render()
  await act(() => button('Reset to Platform Default').click())
  expect((host.querySelector('[name="primaryColor"]') as HTMLInputElement).value).toBe('')
  expect((host.querySelector('[name="resetLogo"]') as HTMLInputElement).checked).toBe(false)
  expect(
    host.querySelector('[aria-label="Tenant identity preview"] img')?.getAttribute('src'),
  ).toBe('/tenant-logo')
  expect(button('Save branding').disabled).toBe(false)
  await act(() => button('Discard').click())
  expect((host.querySelector('[name="primaryColor"]') as HTMLInputElement).value).toBe('#123456')
  expect(button('Save branding').disabled).toBe(true)
})

it('copies the effective colour without saving and reports clipboard failure honestly', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { clipboard: { writeText } }))
  await render()
  await act(() => button('Copy colour').click())
  expect(writeText).toHaveBeenLastCalledWith('#123456')
  expect(host.textContent).toContain('Copied colour: #123456')
  expect(button('Save branding').disabled).toBe(true)
  await act(() => button('Reset to Platform Default').click())
  await act(() => button('Copy colour').click())
  expect(writeText).toHaveBeenLastCalledWith('#ABCDEF')
  writeText.mockRejectedValue(new Error('Permission denied'))
  await act(() => button('Copy colour').click())
  expect(host.textContent).toContain('Could not copy. Select and copy the HEX value manually.')
  expect(save).not.toHaveBeenCalled()
})

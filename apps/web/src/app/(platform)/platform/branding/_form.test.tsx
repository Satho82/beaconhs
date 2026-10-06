// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/i18n/generated', () => ({
  useGeneratedValueTranslations: () => (value: string) => value,
}))
vi.mock('@beaconhs/ui', () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))
import { PlatformBrandingForm } from './_form'

it('preserves edits on failure, hides private errors, and restores saved values on Discard', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  const action = vi.fn().mockRejectedValue(new Error('private storage password'))
  try {
    await act(() =>
      root.render(
        <PlatformBrandingForm action={action}>
          <input name="productName" defaultValue="Uvanoo" />
        </PlatformBrandingForm>,
      ),
    )
    const input = host.querySelector('input')!
    await act(() => {
      input.value = 'Edited'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(() =>
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    )
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Unable to save')
    expect(host.textContent).not.toContain('password')
    expect(input.value).toBe('Edited')
    await act(() =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Discard')!.click(),
    )
    expect(input.value).toBe('Uvanoo')
  } finally {
    await act(() => root.unmount())
  }
})

it('preserves the clicked asset reset button in the existing action payload', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  const action = vi.fn().mockResolvedValue(undefined)
  try {
    await act(() =>
      root.render(
        <PlatformBrandingForm action={action}>
          <button type="submit" name="resetLogo" value="1">
            Reset logo
          </button>
        </PlatformBrandingForm>,
      ),
    )
    const submitter = host.querySelector<HTMLButtonElement>('button[name="resetLogo"]')!
    await act(() =>
      host
        .querySelector('form')!
        .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter })),
    )
    expect(action.mock.calls[0]?.[0].get('resetLogo')).toBe('1')
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Settings saved.')
  } finally {
    await act(() => root.unmount())
  }
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('next-intl', () => ({ useTranslations: () => (value: string) => value }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@beaconhs/ui', () => ({
  cn: (...v: unknown[]) => v.filter(Boolean).join(' '),
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))
import { SettingsForm } from './settings-form'
let root: Root
let host: HTMLDivElement
afterEach(async () => {
  if (root) await act(() => root.unmount())
  host?.remove()
  vi.restoreAllMocks()
})
async function mount(action: (data: FormData) => Promise<void>) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(() =>
    root.render(
      <SettingsForm
        action={action}
        saveLabel="Save"
        discardLabel="Discard"
        navigationLabel="Settings"
      >
        <label>
          Name
          <input name="name" defaultValue="Saved tenant" />
        </label>
      </SettingsForm>,
    ),
  )
  return host.querySelector('input[name="name"]')!
}
describe('settings form state', () => {
  it('retains edits on failure, reports the failure and supports Discard', async () => {
    const action = vi.fn().mockRejectedValue(new Error('private database details'))
    const input = (await mount(action)) as HTMLInputElement
    await act(() => {
      input.value = 'Edited tenant'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(() =>
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    )
    expect(input.value).toBe('Edited tenant')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Unable to save')
    expect(host.textContent).not.toContain('private database details')
    const discard = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Discard')!
    await act(() => discard.click())
    expect(input.value).toBe('Saved tenant')
    expect(discard.disabled).toBe(true)
  })
  it('guards navigation while dirty and clears dirty state only after successful save', async () => {
    const input = (await mount(vi.fn().mockResolvedValue(undefined))) as HTMLInputElement
    await act(() => {
      input.value = 'Edited'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const link = host.querySelector('a[href="/admin/settings/branding"]')!
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(() => link.dispatchEvent(click))
    expect(confirm).toHaveBeenCalled()
    expect(click.defaultPrevented).toBe(true)
    await act(() =>
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    )
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Settings saved.')
    expect(host.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true)
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { Select } from '@beaconhs/ui'

it('Discard restores the visible custom select as well as the submitted native value', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(() =>
      root.render(
        <form>
          <Select name="locale" aria-label="Locale" defaultValue="en">
            <option value="en">English</option>
            <option value="fr">French</option>
          </Select>
        </form>,
      ),
    )
    const select = host.querySelector('select')!
    await act(() => {
      select.value = 'fr'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(host.querySelector('button')?.textContent).toContain('French')
    await act(async () => {
      host.querySelector('form')!.reset()
      await Promise.resolve()
    })
    expect(host.querySelector('button')?.textContent).toContain('English')
    expect(new FormData(host.querySelector('form')!).get('locale')).toBe('en')
  } finally {
    await act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})

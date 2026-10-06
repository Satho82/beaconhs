// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/i18n/generated', () => ({
  useGeneratedValueTranslations: () => (value: string) => value,
}))
vi.mock('@beaconhs/ui', () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))
import { AdminLoadFailure } from './admin-load-failure'
it('announces a safe error and retries the current route without changing tenant context', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  const reset = vi.fn()
  try {
    await act(() => root.render(<AdminLoadFailure reset={reset} />))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Retry to load the saved settings',
    )
    expect(host.querySelector('button')?.textContent).toBe('Retry')
    await act(() => host.querySelector('button')!.click())
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(reset).toHaveBeenCalledOnce()
  } finally {
    await act(() => root.unmount())
  }
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
const mocks = vi.hoisted(() => ({ replace: vi.fn(), search: new URLSearchParams() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/hospitality/properties',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.search,
}))
vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => createElement('a', props),
}))
vi.mock('@beaconhs/ui', () => ({
  Input: (props: Record<string, unknown>) => createElement('input', props),
}))
vi.mock('@/i18n/generated', () => ({
  useGeneratedTranslations: () => (key: string) => key,
  useGeneratedValueTranslations: () => (value: string) => value,
  GeneratedText: ({ id }: { id: string }) => id,
  GeneratedValue: ({ value }: { value: unknown }) => value,
}))
import { SearchInput } from '@/components/search-input'
import { Pagination } from '@/components/pagination'
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  mocks.replace.mockClear()
  mocks.search = new URLSearchParams('q=Hotel&page=3&perPage=5')
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
})
describe('property list controls', () => {
  it('preserves a deep-linked page on mount and resets to page one when search is cleared', async () => {
    await act(async () => root.render(createElement(SearchInput)))
    await act(async () => vi.advanceTimersByTime(300))
    expect(mocks.replace).not.toHaveBeenCalled()
    await act(async () => container.querySelector('button')!.click())
    await act(async () => vi.advanceTimersByTime(300))
    expect(mocks.replace).toHaveBeenCalledWith('/hospitality/properties?perPage=5', {
      scroll: false,
    })
  })
  it.each([1, 3])(
    'disables the correct boundary on page %s while preserving search',
    async (page) => {
      await act(async () =>
        root.render(
          createElement(Pagination, {
            basePath: '/hospitality/properties',
            currentParams: { q: 'Hotel', perPage: '5' },
            total: 15,
            page,
            perPage: 5,
          }),
        ),
      )
      const links = [...container.querySelectorAll('a')]
      expect(links).toHaveLength(1)
      expect(links[0]?.getAttribute('href')).toBe(
        '/hospitality/properties?q=Hotel&perPage=5&page=2',
      )
    },
  )
  it('offers the last available page after an archive leaves the requested page out of range', async () => {
    await act(async () =>
      root.render(
        createElement(Pagination, {
          basePath: '/hospitality/properties',
          currentParams: { q: 'Hotel' },
          total: 5,
          page: 2,
          perPage: 5,
        }),
      ),
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      '/hospitality/properties?q=Hotel&page=1',
    )
  })
  it('shows no navigation when a search has no results', async () => {
    await act(async () =>
      root.render(
        createElement(Pagination, {
          basePath: '/hospitality/properties',
          currentParams: { q: 'missing' },
          total: 0,
          page: 1,
          perPage: 5,
        }),
      ),
    )
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('m_0c726da8b78d42')
  })
})

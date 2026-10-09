import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  preview: vi.fn(),
  review: vi.fn(),
  result: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.context }))
vi.mock('@/lib/imports/property-structure-preview', () => ({
  getPropertyStructurePreview: mocks.preview,
}))
vi.mock('@/lib/imports/property-structure-confirm', () => ({
  getPropertyStructureReview: mocks.review,
}))
vi.mock('@/lib/imports/property-structure-result', () => ({
  getPropertyStructureResult: mocks.result,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@/app/(app)/admin/settings/settings-form', () => ({ SettingsNavigation: () => null }))
vi.mock('@/components/property-import-steps', () => ({ PropertyImportSteps: () => null }))
vi.mock('@/components/search-input', () => ({ SearchInput: () => null }))
vi.mock('@/components/pagination', () => ({ Pagination: () => null }))
vi.mock('@/components/filter-bar', () => ({ FilterChips: () => null }))
vi.mock(
  '@/app/(app)/admin/settings/import-export/property-structure/review/[batchId]/confirm-button',
  () => ({ ConfirmImportButton: () => null }),
)

import PreviewPage from '@/app/(app)/admin/settings/import-export/property-structure/preview/[batchId]/page'
import ReviewPage from '@/app/(app)/admin/settings/import-export/property-structure/review/[batchId]/page'
import ResultPage from '@/app/(app)/admin/settings/import-export/property-structure/result/[batchId]/page'

const batchId = '00000000-0000-4000-8000-000000000001'
const routes = [
  { name: 'preview', page: PreviewPage, load: mocks.preview, args: [batchId, 'all'] },
  { name: 'review', page: ReviewPage, load: mocks.review, args: [batchId] },
  { name: 'result', page: ResultPage, load: mocks.result, args: [batchId] },
] as const

beforeEach(() => {
  vi.resetAllMocks()
  mocks.context.mockResolvedValue({ tenantId: 'disposable-tenant' })
})

describe.each(routes)('property import $name route', ({ page, load, args }) => {
  it.each(['not-a-uuid', '', '00000000-0000-4000-8000-00000000000Z'])(
    'rejects invalid batch ID %s before context or batch access',
    async (invalid) => {
      await expect(
        page({ params: Promise.resolve({ batchId: invalid }), searchParams: Promise.resolve({}) }),
      ).rejects.toThrow('NOT_FOUND')
      expect(mocks.context).not.toHaveBeenCalled()
      expect(mocks.preview).not.toHaveBeenCalled()
      expect(mocks.review).not.toHaveBeenCalled()
      expect(mocks.result).not.toHaveBeenCalled()
    },
  )

  it('retains the authenticated context boundary', async () => {
    mocks.context.mockRejectedValue(new Error('ACCESS_DENIED'))
    await expect(
      page({ params: Promise.resolve({ batchId }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('ACCESS_DENIED')
    expect(load).not.toHaveBeenCalled()
  })

  it('delegates valid IDs to the existing scoped loader and preserves its access rejection', async () => {
    load.mockRejectedValue(new Error('BATCH_ACCESS_DENIED'))
    await expect(
      page({ params: Promise.resolve({ batchId }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('BATCH_ACCESS_DENIED')
    expect(mocks.context).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalledExactlyOnceWith(...args)
    expect(mocks.context.mock.invocationCallOrder[0]).toBeLessThan(
      load.mock.invocationCallOrder[0]!,
    )
  })

  it('returns not found when the scoped loader cannot expose the batch', async () => {
    load.mockResolvedValue(null)
    await expect(
      page({ params: Promise.resolve({ batchId }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NOT_FOUND')
    expect(load).toHaveBeenCalledExactlyOnceWith(...args)
  })
})

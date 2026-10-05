import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ ensureBucket: vi.fn() }))

vi.mock('@beaconhs/storage', () => ({ ensureBucket: mocks.ensureBucket }))

describe('storage-init entrypoint', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.exitCode = undefined
  })

  afterEach(() => {
    process.exitCode = undefined
  })

  it('completes only after the private bucket baseline passes', async () => {
    mocks.ensureBucket.mockResolvedValue(undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await import('./storage-init')
    await vi.waitFor(() => expect(mocks.ensureBucket).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        '[storage-init] private bucket policy, lifecycle, and anonymous-read probe passed',
      ),
    )
    expect(process.exitCode).toBeUndefined()
    log.mockRestore()
  })

  it('fails closed when the storage baseline cannot be established', async () => {
    const failure = new Error('fixture storage failure')
    mocks.ensureBucket.mockRejectedValue(failure)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await import('./storage-init')
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[storage-init] failed:', failure))
    expect(process.exitCode).toBe(1)
    error.mockRestore()
  })
})

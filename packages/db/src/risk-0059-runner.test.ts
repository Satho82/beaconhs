import { describe, expect, it, vi } from 'vitest'
import { isolated0059Statement, runIsolated0059 } from './risk-0059-runner'

describe('retired standalone 0059 execution', () => {
  it('retains offline inspection of the exact canonical enum statement', () => {
    expect(isolated0059Statement()).toBe(
      "ALTER TYPE risk_template_state ADD VALUE IF NOT EXISTS 'draft'",
    )
  })
  it('rejects stale callers before invoking any database transport', async () => {
    const transport = vi.fn()
    await expect(runIsolated0059(transport, 'beaconhs_owner')).rejects.toThrow('0059 is canonical')
    expect(transport).not.toHaveBeenCalled()
  })
})

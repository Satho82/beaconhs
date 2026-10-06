import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@beaconhs/db'
import { materializeTenant, ensureSystemObligations } from './materialize'
import { materializeEvidenceTargetObligations } from './evidence'
import { materializeIdentityAudienceObligations } from './identity'
function disabled() {
  const select = vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }))
  return { tx: { select } as unknown as Database, select }
}
describe('disabled Compliance background entry points', () => {
  it('skips a tenant scan before reading obligations or writing system requirements', async () => {
    const { tx, select } = disabled()
    expect(await materializeTenant(tx, 'tenant')).toEqual([])
    expect(select).toHaveBeenCalledOnce()
  })
  it('does not provision system obligations', async () => {
    const { tx, select } = disabled()
    await ensureSystemObligations(tx, 'tenant')
    expect(select).toHaveBeenCalledOnce()
  })
  it('leaves shared evidence writes independent while skipping Compliance recalculation', async () => {
    const { tx, select } = disabled()
    expect(
      await materializeEvidenceTargetObligations(tx, 'tenant', {
        kind: 'document',
        documentId: 'document',
      } as never),
    ).toEqual({ obligationIds: [] })
    expect(select).toHaveBeenCalledOnce()
  })
  it('skips identity/import-triggered Compliance recalculation', async () => {
    const { tx, select } = disabled()
    expect(await materializeIdentityAudienceObligations(tx, 'tenant', ['person'])).toEqual({
      personIds: [],
      obligationIds: [],
    })
    expect(select).toHaveBeenCalledOnce()
  })
})

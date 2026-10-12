import { describe, expect, it } from 'vitest'
import { isLocalApprovalsPreview } from './preview-guard'

const valid = {
  mode: 'development',
  enabled: '1',
  host: 'localhost:3103',
  databaseUrl: 'postgres://beaconhs_app@127.0.0.1:54321/reconcile_fixture',
}
describe('isolated Approvals preview boundary', () => {
  it('allows only the explicit local fixture configuration', () => {
    expect(isLocalApprovalsPreview(valid)).toBe(true)
  })
  it.each([
    { mode: 'production' },
    { enabled: undefined },
    { host: 'dev.uvanoo.com' },
    { host: '127.0.0.1:3103' },
    { databaseUrl: undefined },
    { databaseUrl: 'not a URL' },
    { databaseUrl: 'postgres://beaconhs_app@dev.uvanoo.com/reconcile_fixture' },
    { databaseUrl: 'postgres://beaconhs_app@127.0.0.1/beaconhs_clean155_final' },
    { databaseUrl: 'postgres://beaconhs_owner@127.0.0.1/reconcile_fixture' },
    { databaseUrl: 'https://beaconhs_app@127.0.0.1/reconcile_fixture' },
  ])('rejects unsafe configuration %j', (change) => {
    expect(isLocalApprovalsPreview({ ...valid, ...change })).toBe(false)
  })
})

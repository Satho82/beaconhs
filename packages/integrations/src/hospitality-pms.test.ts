import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePmsRoomState, pmsRoomIdentity } from './hospitality-pms'

test('PMS room states normalize behind a vendor-neutral boundary', () => {
  assert.equal(normalizePmsRoomState('Occupied'), 'occupied')
  assert.equal(normalizePmsRoomState('out-of-service'), 'out_of_service')
  assert.equal(normalizePmsRoomState('INSPECTED'), 'vacant')
  assert.equal(normalizePmsRoomState({}), 'unknown')
})

test('PMS room identity is stable and rejects unsafe identifiers', () => {
  assert.equal(pmsRoomIdentity('MEWS', 'room-001'), 'mews:room-001')
  assert.throws(() => pmsRoomIdentity('../mews', 'room-001'), /provider/)
  assert.throws(() => pmsRoomIdentity('mews', 'bad\nroom'), /room id/)
})

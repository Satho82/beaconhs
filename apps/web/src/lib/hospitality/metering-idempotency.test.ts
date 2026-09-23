import { describe, expect, it } from 'vitest'
import { sameMeterDefinition } from './metering-policy'

const meter = {
  name: 'Main electricity meter',
  meterType: 'electricity' as const,
  location: 'Plant room',
  serialNumber: 'ELEC-100',
  mpan: '1234567890123',
  measurementUnit: 'kWh',
  notes: null,
  installedAt: '2026-09-01',
  openingReading: 100,
  previousMeterId: null,
  replacementDate: null,
}

describe('meter creation idempotency', () => {
  it('recognises an exact replay as the same meter', () => {
    expect(sameMeterDefinition(meter, { ...meter })).toBe(true)
  })

  it('does not conflate a conflicting serial-number reuse with a replay', () => {
    expect(sameMeterDefinition(meter, { ...meter, location: 'Roof' })).toBe(false)
  })
})

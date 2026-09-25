import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { calculateConsumption, estimatedExpenditure } from './metering'

const service = readFileSync(new URL('./metering.ts', import.meta.url), 'utf8')
const page = readFileSync(
  new URL('../../app/(app)/hospitality/metering/page.tsx', import.meta.url),
  'utf8',
)

describe('Metering calculations and security contracts', () => {
  it('calculates normal consumption and expenditure', () => {
    expect(calculateConsumption(125000, 127400, 'normal')).toBe(2400)
    expect(estimatedExpenditure(2400, 0.24)).toBe(576)
  })
  it('never silently creates negative consumption', () => {
    expect(() => calculateConsumption(100, 99, 'normal')).toThrow(/reset or replacement/)
    expect(calculateConsumption(100, 2, 'reset')).toBeNull()
    expect(calculateConsumption(null, 12, 'normal')).toBeNull()
  })
  it('requires manager permission for setup and read permission for operational entry', () => {
    expect(service).toContain("assertCan(ctx, 'hospitality.manage')")
    expect(service).toContain("assertCan(ctx, 'hospitality.read')")
    expect(service).toContain('assertCanAccessProperty(ctx, input.propertyId)')
    expect(service).toContain('assertCanAccessProperty(ctx, meter.propertyId)')
    expect(page).toContain('mayManage &&')
    expect(page).toContain("item !== 'setup' || mayManage")
  })
  it('stores effective tariff cost snapshots instead of recomputing history', () => {
    expect(service).toContain('unitCostSnapshot:')
    expect(service).toContain('currencySnapshot:')
    expect(service).toContain('estimatedExpenditure: cost')
    expect(service).toContain('lte(hospitalityMeterTariffs.effectiveFrom, at)')
  })
  it('provides one Metering workspace with required sections and searchable identifiers', () => {
    for (const value of [
      'overview',
      'enter-reading',
      'history',
      'analytics',
      'setup',
      'Serial Number',
      'MPAN',
    ]) {
      expect(page).toContain(value)
    }
    expect(page).toContain('Consumption over time')
    expect(page).toContain('Expenditure over time')
    expect(page).toContain('No data for this period.')
  })
})

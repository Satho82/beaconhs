import { describe, expect, it } from 'vitest'
import { isNavModuleEntitled } from './resolve'

describe('module entitlement navigation filter', () => {
  it('does not restore hospitality from a tenant navigation preference when its module is disabled', () => {
    expect(isNavModuleEntitled('hospitality', new Set())).toBe(false)
    expect(isNavModuleEntitled('hospitality', new Set(['hospitality.properties']))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  assertModuleEntitled,
  assertModuleKey,
  effectiveModuleKeys,
  isModuleEntitled,
  ModuleNotEntitledError,
} from './policy'

describe('module entitlement policy', () => {
  it('accepts only catalogue keys at the authorization boundary', () => {
    expect(() => assertModuleKey('hospitality.properties')).not.toThrow()
    expect(() => assertModuleKey('hospitality.future')).toThrow(/Unknown module entitlement key/)
  })

  it('does not grant access for an unknown stored key', () => {
    const effective = effectiveModuleKeys(['hospitality.properties', 'hospitality.future'])
    expect([...effective]).toEqual(['hospitality.properties'])
  })

  it('requires an explicit enabled entitlement', () => {
    expect(isModuleEntitled(['hospitality.maintenance'], 'hospitality.maintenance')).toBe(true)
    expect(isModuleEntitled([], 'hospitality.maintenance')).toBe(false)
    expect(() => assertModuleEntitled([], 'hospitality.maintenance')).toThrow(
      ModuleNotEntitledError,
    )
  })
})

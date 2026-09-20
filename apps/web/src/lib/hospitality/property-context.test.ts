import { describe, expect, it } from 'vitest'
import { ALL_PROPERTIES_CONTEXT, resolveActiveHospitalityProperty } from './property-context'

const fenchurch = { id: '20000000-0000-4000-8000-000000000001' }
const lincoln = { id: '20000000-0000-4000-8000-000000000002' }

describe('hospitality property context', () => {
  it('keeps an authorised cluster manager selection and supports portfolio context', () => {
    expect(resolveActiveHospitalityProperty([fenchurch, lincoln], fenchurch.id)).toBe(fenchurch.id)
    expect(
      resolveActiveHospitalityProperty([fenchurch, lincoln], ALL_PROPERTIES_CONTEXT),
    ).toBeNull()
  })

  it('ignores an unauthorised cookie property identifier for a single-property user', () => {
    expect(resolveActiveHospitalityProperty([fenchurch], lincoln.id)).toBe(fenchurch.id)
  })

  it('automatically scopes a single-property user to their only property', () => {
    expect(resolveActiveHospitalityProperty([lincoln], ALL_PROPERTIES_CONTEXT)).toBe(lincoln.id)
  })
})

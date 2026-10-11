import { describe, expect, it } from 'vitest'
import { MODULE_ADMIN } from './registry'

describe('module administration registry', () => {
  it('does not expose the retired Hazard Assessments management surfaces', () => {
    expect(MODULE_ADMIN.some((entry) => entry.moduleKey === 'hazid')).toBe(false)
    expect(
      MODULE_ADMIN.flatMap((entry) => [
        entry.href,
        entry.managePath,
        ...entry.tabs.map((tab) => tab.href),
        ...entry.sections.map((section) => section.href),
      ]).some((href) => href.startsWith('/hazard-assessments')),
    ).toBe(false)
  })
})

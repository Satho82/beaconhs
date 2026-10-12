import { describe, expect, it } from 'vitest'
import { assignmentAllowsProperty } from './property-authority'

describe('Approvals assignment provenance', () => {
  const rows = [
    {
      role_id: 'privileged',
      permissions: ['approvals.configure'],
      scope: { type: 'properties' as const, propertyIds: ['a'] },
    },
    {
      role_id: 'unrelated',
      permissions: ['documents.read'],
      scope: { type: 'properties' as const, propertyIds: ['b'] },
    },
  ]
  it('does not combine permission A with unrelated scope B', () => {
    expect(assignmentAllowsProperty(rows, 'approvals.configure', 'a')).toBe(true)
    expect(assignmentAllowsProperty(rows, 'approvals.configure', 'b')).toBe(false)
  })
  it('honors active role selection', () => {
    expect(assignmentAllowsProperty(rows, 'approvals.configure', 'a', 'unrelated')).toBe(false)
  })
  it('supports explicit tenant-wide wildcard assignment', () => {
    expect(
      assignmentAllowsProperty(
        [{ role_id: 'admin', permissions: ['approvals.*'], scope: { type: 'tenant' } }],
        'approvals.configure',
        'b',
      ),
    ).toBe(true)
  })
  it('fails closed without assignment provenance', () => {
    expect(assignmentAllowsProperty([], 'approvals.configure', 'a')).toBe(false)
  })
})

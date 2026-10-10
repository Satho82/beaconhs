import { describe, expect, it } from 'vitest'
import { planRiskHazardEdit } from './risk-hazard-edit'

const saved = [
  { id: 'tenant-a-assessment-1-hazard-1', sortOrder: 0 },
  { id: 'tenant-a-assessment-1-hazard-2', sortOrder: 1 },
]

describe('Risk hazard identity and corrective-action source preservation', () => {
  it('parks a swap outside both order ranges without changing hazard IDs', () => {
    const submitted: { id?: string }[] = [saved[1]!, {}, saved[0]!]
    const parked = planRiskHazardEdit(saved, submitted)
    const occupied = new Map(saved.map((hazard) => [hazard.id, hazard.sortOrder]))
    for (const hazard of parked) {
      expect([...occupied.values()]).not.toContain(hazard.sortOrder)
      occupied.set(hazard.id, hazard.sortOrder)
    }
    for (const [index, hazard] of submitted.entries()) {
      expect([...occupied.values()]).not.toContain(index)
      occupied.set(hazard.id ?? 'new-hazard', index)
    }
    expect(occupied.get(saved[0]!.id)).toBe(2)
    expect(occupied.get(saved[1]!.id)).toBe(0)
  })

  it('allows additions without assigning a client-supplied identity', () => {
    expect(planRiskHazardEdit(saved, [...saved, {}]).map((hazard) => hazard.id)).toEqual(
      saved.map((hazard) => hazard.id),
    )
  })

  it.each(['tenant-b-hazard', 'tenant-a-assessment-2-hazard', '', null])(
    'rejects foreign or invalid source identity %s',
    (id) => {
      expect(() => planRiskHazardEdit(saved, [...saved, { id } as { id: string }])).toThrow(
        /does not belong/,
      )
    },
  )

  it('rejects duplicate IDs instead of updating one hazard twice', () => {
    expect(() => planRiskHazardEdit(saved, [...saved, saved[0]!])).toThrow(/more than once/)
  })

  it('rejects omission even when the caller cannot see a linked corrective action', () => {
    expect(() => planRiskHazardEdit(saved, [saved[0]!])).toThrow(/must be retained/)
  })

  it('rejects a stale editor that does not contain a concurrently added saved hazard', () => {
    expect(() =>
      planRiskHazardEdit([...saved, { id: 'concurrent-hazard', sortOrder: 2 }], saved),
    ).toThrow(/must be retained/)
  })

  it('rejects replacing all saved hazards with new anonymous rows', () => {
    expect(() => planRiskHazardEdit(saved, [{}, {}])).toThrow(/must be retained/)
  })

  it('rejects an empty assessment', () => {
    expect(() => planRiskHazardEdit(saved, [])).toThrow(/At least one/)
  })

  it('rejects temporary sort positions that would overflow PostgreSQL integer', () => {
    expect(() =>
      planRiskHazardEdit([{ id: 'hazard', sortOrder: 2_147_483_647 }], [{ id: 'hazard' }]),
    ).toThrow(/supported range/)
  })
})

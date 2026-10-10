import { describe, expect, it } from 'vitest'
import { canonicalRiskMatrixSnapshot } from '@beaconhs/db/risk-matrix'
import { validateRiskMatrixSnapshot, captureRiskMatrix } from './risk-revisions'

describe('immutable matrix evidence', () => {
  it('captures a detached matrix without reinterpreting historical absence', () => {
    const matrix = canonicalRiskMatrixSnapshot(),
      snapshot = validateRiskMatrixSnapshot(matrix)
    matrix.cells['0:0']!.label = 'Critical'
    expect(snapshot.cells['0:0']!.label).toBe('Low')
    expect(() => validateRiskMatrixSnapshot(null)).toThrow()
    expect(captureRiskMatrix()).toEqual(canonicalRiskMatrixSnapshot())
  })
  it.each([
    (m: Record<string, unknown>) => {
      delete m.schemaVersion
    },
    (m: Record<string, unknown>) => {
      m.schemaVersion = 2
    },
    (m: Record<string, unknown>) => {
      m.size = 4
    },
    (m: Record<string, unknown>) => {
      m.modelKey = 'external-model'
    },
    (m: Record<string, unknown>) => {
      m.extra = true
    },
    (m: Record<string, unknown>) => {
      m.axes = { severity: { values: ['one'] }, likelihood: { values: ['one'] } }
    },
    (m: Record<string, unknown>) => {
      m.cells = {}
    },
  ])('rejects incomplete or unsupported evidence', (mutate) => {
    const matrix = canonicalRiskMatrixSnapshot()
    mutate(matrix as unknown as Record<string, unknown>)
    expect(() => validateRiskMatrixSnapshot(matrix)).toThrow()
  })
  it.each([
    { score: 99 },
    { label: 'Safe' },
    { color: 'url(https://example.invalid)' },
    { extra: true },
  ])('rejects invalid matrix cells', (patch) => {
    const matrix = canonicalRiskMatrixSnapshot()
    Object.assign(matrix.cells['0:0']!, patch)
    expect(() => validateRiskMatrixSnapshot(matrix)).toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import {
  assertImportTransition,
  parseImportRows,
  previewImport,
  type ImportDataset,
  validateImportRows,
} from './engine'

const dataset: ImportDataset<{ code: string }> = {
  id: 'test.rows',
  columns: ['code'],
  requiredColumns: ['code'],
  map: (row) => ({ code: row.code ?? '' }),
  validate: (row) => (row.code ? [] : [{ severity: 'error', message: 'Code is required.' }]),
  duplicate: async (row) => (row.code === 'existing' ? 'existing-record' : null),
}

describe('governed import engine', () => {
  it('preserves row provenance and never drops malformed values during parse', () => {
    expect(parseImportRows('code,extra\r\n A ,one\r\n,broken\r\n', dataset)).toEqual([
      { sourceRowNumber: 2, values: { code: 'A', extra: 'one' } },
      { sourceRowNumber: 3, values: { code: '', extra: 'broken' } },
    ])
  })

  it('reports validation and duplicate outcomes in a read-only preview model', async () => {
    const rows = await validateImportRows(
      parseImportRows('code\nnew\nexisting\n\n', dataset),
      dataset,
    )
    expect(previewImport(rows, dataset)).toMatchObject({ total: 2, invalid: 0, duplicates: 1 })
  })

  it('ignores empty CSV rows but preserves malformed non-empty rows for validation', async () => {
    const rows = await validateImportRows(parseImportRows('code\n\n,broken\n', dataset), dataset)
    expect(rows).toEqual([expect.objectContaining({ sourceRowNumber: 2, values: { code: '' } })])
    expect(previewImport(rows, dataset)).toMatchObject({ total: 1, invalid: 1 })
  })

  it('allows only linear confirmation and execution states', () => {
    expect(() => assertImportTransition('parsed', 'processing')).toThrow(
      /Illegal import state transition/,
    )
    expect(() => assertImportTransition('ready_for_confirmation', 'processing')).not.toThrow()
    expect(() => assertImportTransition('completed', 'processing')).toThrow(
      /Illegal import state transition/,
    )
  })
})

import { describe, expect, it } from 'vitest'
import { parseImportRows, validateImportRows } from './engine'
import { peopleImportDataset, peopleTemplateCsv, validatePeopleReferences } from './people'
describe('People import contract', () => {
  it('validates canonical rows without writes', async () => {
    const rows = parseImportRows(
      `${peopleTemplateCsv()}E1,Ada,Lovelace,ada@example.com,,,active,,,,\n`,
      peopleImportDataset,
    )
    expect((await validateImportRows(rows, peopleImportDataset))[0]?.issues).toEqual([])
  })
  it('retains invalid rows and rejects unknown tenant references', () => {
    const row = peopleImportDataset.map({
      first_name: '',
      last_name: 'L',
      email: 'bad',
      property_code: 'x',
    })
    expect(
      [
        ...peopleImportDataset.validate(row),
        ...validatePeopleReferences(row, {
          departments: new Set(),
          trades: new Set(),
          crews: new Set(),
          properties: new Set(),
          existingEmployeeNos: new Set(),
        }),
      ].map((x) => x.severity),
    ).toEqual(['error', 'error', 'error'])
  })
})

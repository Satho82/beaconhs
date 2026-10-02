import { describe, expect, it } from 'vitest'
import { parseImportRows, previewImport, validateImportRows } from './engine'
import {
  propertyStructureImportDataset,
  propertyStructureTemplateCsv,
  validatePropertyStructureRows,
} from './property-structure'

describe('Property Structure import contract', () => {
  it('uses the canonical template and preserves validated CSV rows for a governed batch', async () => {
    const source = `${propertyStructureTemplateCsv()}hotel-a,Hotel A,Europe/London,main,Main,ground,Ground,101,Room 101,Double\r\n`
    const rows = parseImportRows(source, propertyStructureImportDataset)
    const validated = await validateImportRows(rows, propertyStructureImportDataset)
    const hierarchy = validatePropertyStructureRows(rows.map((row) => row.values))

    expect(validated).toHaveLength(1)
    expect(hierarchy[0]?.issues).toEqual([])
    expect(previewImport(validated, propertyStructureImportDataset)).toMatchObject({
      total: 1,
      invalid: 0,
      proposedCreates: 1,
    })
  })

  it('keeps hierarchy failures in validation rather than creating operational records', () => {
    const rows = validatePropertyStructureRows([
      {
        property_code: 'hotel-a',
        property_name: 'Hotel A',
        property_timezone: 'Europe/London',
        building_code: '',
        building_name: '',
        floor_code: 'ground',
        floor_name: 'Ground',
        room_code: '101',
        room_name: 'Room 101',
        room_type: 'Double',
      },
    ])

    expect(rows[0]?.issues.map((issue) => issue.message)).toContain(
      'A floor requires a building code.',
    )
  })
})

export const PROPERTY_STRUCTURE_COLUMNS = [
  'property_code',
  'property_name',
  'property_timezone',
  'building_code',
  'building_name',
  'floor_code',
  'floor_name',
  'room_code',
  'room_name',
  'room_type',
] as const

export type PropertyStructureRow = Record<(typeof PROPERTY_STRUCTURE_COLUMNS)[number], string>
export type PropertyStructureIssue = { severity: 'error' | 'warning'; message: string }

export const propertyStructureImportDataset = {
  id: 'property.structure',
  columns: PROPERTY_STRUCTURE_COLUMNS,
  requiredColumns: PROPERTY_STRUCTURE_COLUMNS,
  map: (row: Record<string, string>): PropertyStructureRow =>
    Object.fromEntries(
      PROPERTY_STRUCTURE_COLUMNS.map((column) => [column, row[column] ?? '']),
    ) as PropertyStructureRow,
  validate: (_row: PropertyStructureRow): PropertyStructureIssue[] => [],
} as const

export function propertyStructureTemplateCsv(): string {
  return `${PROPERTY_STRUCTURE_COLUMNS.join(',')}\r\n`
}

function value(row: Record<string, string>, key: keyof PropertyStructureRow): string {
  return (row[key] ?? '').trim()
}

function propertyKey(row: Record<string, string>) {
  return value(row, 'property_code').toLowerCase()
}

/** Validates same-batch hierarchy only; preview performs no operational writes. */
export function validatePropertyStructureRows(rows: readonly Record<string, string>[]) {
  const seenRooms = new Set<string>()
  return rows.map((row, index) => {
    const issues: PropertyStructureIssue[] = []
    const propertyCode = propertyKey(row)
    const buildingCode = value(row, 'building_code').toLowerCase()
    const floorCode = value(row, 'floor_code').toLowerCase()
    const roomCode = value(row, 'room_code').toLowerCase()
    if (!propertyCode) issues.push({ severity: 'error', message: 'Property code is required.' })
    if (!value(row, 'property_name'))
      issues.push({ severity: 'error', message: 'Property name is required.' })
    if (!value(row, 'property_timezone'))
      issues.push({ severity: 'error', message: 'Property timezone is required.' })
    const timezone = value(row, 'property_timezone')
    if (timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone })
      } catch {
        issues.push({ severity: 'error', message: 'Property timezone is invalid.' })
      }
    }
    if (floorCode && !buildingCode)
      issues.push({ severity: 'error', message: 'A floor requires a building code.' })
    if (roomCode && !floorCode)
      issues.push({ severity: 'error', message: 'A room requires a floor code.' })
    if (roomCode) {
      if (seenRooms.has(roomCode))
        issues.push({ severity: 'error', message: 'Room code is duplicated.' })
      seenRooms.add(roomCode)
    }
    return { sourceRowNumber: index + 2, values: row, issues }
  })
}

export function propertyStructurePreview(rows: ReturnType<typeof validatePropertyStructureRows>) {
  const unique = (keyFor: (values: Record<string, string>) => string) =>
    new Set(rows.map(({ values }) => keyFor(values)).filter(Boolean)).size
  return {
    rows: rows.length,
    errors: rows.filter((row) => row.issues.some((issue) => issue.severity === 'error')).length,
    warnings: rows.filter((row) => row.issues.some((issue) => issue.severity === 'warning')).length,
    propertiesToCreate: unique((values) => value(values, 'property_code')),
    buildingsToCreate: unique(
      (values) => `${value(values, 'property_code')}/${value(values, 'building_code')}`,
    ),
    floorsToCreate: unique(
      (values) =>
        `${value(values, 'property_code')}/${value(values, 'building_code')}/${value(values, 'floor_code')}`,
    ),
    roomsToCreate: unique(
      (values) =>
        `${value(values, 'property_code')}/${value(values, 'building_code')}/${value(values, 'floor_code')}/${value(values, 'room_code')}`,
    ),
    roomTypesToReference: unique((values) => value(values, 'room_type')),
  }
}

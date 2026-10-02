import type { ImportIssue } from './engine'

const PEOPLE_IMPORT_COLUMNS = [
  'employee_no',
  'first_name',
  'last_name',
  'email',
  'phone',
  'status',
  'department',
  'trade',
  'crew',
  'property_code',
] as const
type PeopleImportRow = Record<(typeof PEOPLE_IMPORT_COLUMNS)[number], string>
type PeopleImportReferences = {
  departments: ReadonlySet<string>
  trades: ReadonlySet<string>
  crews: ReadonlySet<string>
  properties: ReadonlySet<string>
  existingEmployeeNos: ReadonlySet<string>
}

export const peopleImportDataset = {
  id: 'people',
  columns: PEOPLE_IMPORT_COLUMNS,
  requiredColumns: ['first_name', 'last_name'] as const,
  map: (row: Record<string, string>): PeopleImportRow =>
    Object.fromEntries(
      PEOPLE_IMPORT_COLUMNS.map((key) => [key, (row[key] ?? '').trim()]),
    ) as PeopleImportRow,
  validate: (row: PeopleImportRow): ImportIssue[] => {
    const issues: ImportIssue[] = []
    if (!row.first_name) issues.push({ severity: 'error', message: 'First name is required.' })
    if (!row.last_name) issues.push({ severity: 'error', message: 'Last name is required.' })
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
      issues.push({ severity: 'error', message: 'Email is invalid.' })
    if (row.status && !['active', 'inactive', 'terminated'].includes(row.status))
      issues.push({ severity: 'error', message: 'Status is invalid.' })
    return issues
  },
} as const
export function peopleTemplateCsv() {
  return `${PEOPLE_IMPORT_COLUMNS.join(',')}\r\n`
}
export function validatePeopleReferences(
  row: PeopleImportRow,
  refs: PeopleImportReferences,
): ImportIssue[] {
  const checks: Array<[keyof PeopleImportRow, ReadonlySet<string>, string]> = [
    ['department', refs.departments, 'Department'],
    ['trade', refs.trades, 'Trade'],
    ['crew', refs.crews, 'Crew'],
    ['property_code', refs.properties, 'Property'],
  ]
  return checks.flatMap(([key, values, label]) =>
    row[key] && !values.has(row[key])
      ? [{ severity: 'error' as const, message: `${label} reference is unknown.` }]
      : [],
  )
}

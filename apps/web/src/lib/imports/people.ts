import type { RequestContext } from '@beaconhs/tenant'
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
  'job_title',
  'property_code',
] as const
type PeopleImportRow = Record<(typeof PEOPLE_IMPORT_COLUMNS)[number], string>
export type PeopleImportReferences = {
  departments: ReadonlySet<string>
  trades: ReadonlySet<string>
  crews: ReadonlySet<string>
  jobTitles: ReadonlySet<string>
  properties: ReadonlySet<string>
  existingEmployeeNos: ReadonlyMap<string, string>
  existingEmails: ReadonlyMap<string, string>
}

function normalizedReference(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
}

function duplicateReference(row: PeopleImportRow, refs: PeopleImportReferences): string | null {
  const employeeNo = normalizedReference(row.employee_no)
  if (employeeNo) return refs.existingEmployeeNos.get(employeeNo) ?? null
  const email = normalizedReference(row.email)
  return email ? (refs.existingEmails.get(email) ?? null) : null
}

export const peopleImportDataset = {
  id: 'people',
  columns: PEOPLE_IMPORT_COLUMNS,
  requiredColumns: ['first_name', 'last_name'] as const,
  resolveReferences: async (ctx: RequestContext): Promise<PeopleImportReferences> => {
    const { resolvePeopleImportReferences } = await import('./people-references.server')
    return resolvePeopleImportReferences(ctx)
  },
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

/**
 * Binds the generic import engine to a tenant-scoped, read-only reference
 * snapshot. Existing people are surfaced as reviewable skips; imports never
 * silently overwrite a person or infer an update.
 */
export function createPeopleImportDataset(refs: PeopleImportReferences) {
  return {
    ...peopleImportDataset,
    duplicate: async (row: PeopleImportRow) => duplicateReference(row, refs),
  }
}
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
    ['job_title', refs.jobTitles, 'Job title'],
    ['property_code', refs.properties, 'Property'],
  ]
  return checks.flatMap(([key, values, label]) =>
    row[key] && !values.has(normalizedReference(row[key]))
      ? [{ severity: 'error' as const, message: `${label} reference is unknown.` }]
      : [],
  )
}

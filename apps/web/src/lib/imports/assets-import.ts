import type { ImportIssue } from './engine'

const COLUMNS = [
  'asset_tag',
  'name',
  'category',
  'type',
  'site',
  'status',
  'serial_number',
  'manufacturer',
  'model',
  'purchase_date',
] as const

export type AssetImportRow = Record<(typeof COLUMNS)[number], string>

const statuses = new Set(['in_service', 'out_of_service', 'in_repair', 'lost', 'retired'])

export const assetImportDataset = {
  id: 'equipment.assets',
  columns: COLUMNS,
  requiredColumns: ['asset_tag', 'name'] as const,
  map: (row: Record<string, string>): AssetImportRow =>
    Object.fromEntries(COLUMNS.map((column) => [column, (row[column] ?? '').trim()])) as AssetImportRow,
  validate: (row: AssetImportRow): ImportIssue[] => {
    const issues: ImportIssue[] = []
    if (!row.asset_tag) issues.push({ severity: 'error', message: 'Asset tag is required.' })
    if (!row.name) issues.push({ severity: 'error', message: 'Asset name is required.' })
    if (row.status && !statuses.has(row.status))
      issues.push({ severity: 'error', message: 'Status must be in_service, out_of_service, in_repair, lost, or retired.' })
    if (row.purchase_date && !/^\\d{4}-\\d{2}-\\d{2}$/.test(row.purchase_date))
      issues.push({ severity: 'error', message: 'Purchase date must use YYYY-MM-DD.' })
    return issues
  },
} as const

export function assetImportTemplateCsv(): string {
  return [
    COLUMNS.join(','),
    'ASSET-001,Example pump,Plant,Mechanical,Main Site,in_service,SN-001,Example Co,MX-1,2026-01-15',
  ].join('\\r\\n') + '\\r\\n'
}

export function assetImportBatchIssues(rows: readonly AssetImportRow[]): ImportIssue[][] {
  const seen = new Set<string>()
  return rows.map((row) => {
    const key = row.asset_tag.toLowerCase()
    if (!key || !seen.has(key)) {
      seen.add(key)
      return []
    }
    return [{ severity: 'error', message: 'Asset tag is duplicated within this file.' }]
  })
}
import 'server-only'

const MAX_IMPORT_ROWS = 10_000
export type ImportIssue = { severity: 'error' | 'warning'; message: string }
type ImportAction = 'create' | 'update' | 'skip'
type ImportBatchState =
  | 'received'
  | 'parsed'
  | 'ready_for_confirmation'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

type ParsedImportRow = { sourceRowNumber: number; values: Record<string, string> }
export type ValidatedImportRow<T> = ParsedImportRow & {
  mapped: T | null
  issues: ImportIssue[]
  proposedAction: ImportAction
  duplicateReference?: string
}

export type ImportDataset<T> = {
  id: string
  columns: readonly string[]
  requiredColumns: readonly string[]
  map(row: Record<string, string>): T
  validate(row: T): ImportIssue[]
  duplicate?(row: T): Promise<string | null>
  preview?(rows: readonly ValidatedImportRow<T>[]): Record<string, number>
  allowUpdates?: boolean
}

/** RFC-4180-compatible enough for governed CSV intake; preserves all source rows. */
function parseCsv(source: string): string[][] {
  if (source.length > 5_000_000) throw new Error('Import file exceeds the 5 MB limit.')
  const rows: string[][] = [[]]
  let value = ''
  let quoted = false
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!
    if (quoted && char === '"' && source[index + 1] === '"') {
      value += '"'
      index++
    } else if (char === '"') quoted = !quoted
    else if (!quoted && char === ',') {
      rows.at(-1)!.push(value.trim())
      value = ''
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && source[index + 1] === '\n') index++
      rows.at(-1)!.push(value.trim())
      value = ''
      rows.push([])
    } else value += char
  }
  if (quoted) throw new Error('Import CSV contains an unterminated quoted value.')
  rows.at(-1)!.push(value.trim())
  return rows.filter((row) => row.some(Boolean))
}

export function parseImportRows<T>(source: string, dataset: ImportDataset<T>): ParsedImportRow[] {
  const [header, ...body] = parseCsv(source)
  if (!header) throw new Error('Import file has no header row.')
  const columns = header.map((column) => column.trim().toLowerCase())
  const missing = dataset.requiredColumns.filter((column) => !columns.includes(column))
  if (missing.length)
    throw new Error(`Import file is missing required columns: ${missing.join(', ')}.`)
  if (body.length > MAX_IMPORT_ROWS) throw new Error(`Import file exceeds ${MAX_IMPORT_ROWS} rows.`)
  return body.map((cells, index) => ({
    sourceRowNumber: index + 2,
    values: Object.fromEntries(columns.map((column, cell) => [column, cells[cell]?.trim() ?? ''])),
  }))
}

export async function validateImportRows<T>(
  rows: readonly ParsedImportRow[],
  dataset: ImportDataset<T>,
): Promise<ValidatedImportRow<T>[]> {
  return Promise.all(
    rows.map(async (row) => {
      const mapped = dataset.map(row.values)
      const issues = dataset.validate(mapped)
      const duplicateReference = dataset.duplicate ? await dataset.duplicate(mapped) : null
      if (duplicateReference)
        issues.push({ severity: 'warning', message: 'Existing record matched.' })
      return {
        ...row,
        mapped,
        issues,
        duplicateReference: duplicateReference ?? undefined,
        proposedAction: duplicateReference ? 'skip' : 'create',
      }
    }),
  )
}

export function previewImport<T>(
  rows: readonly ValidatedImportRow<T>[],
  dataset: ImportDataset<T>,
) {
  const invalid = rows.filter((row) =>
    row.issues.some((issue) => issue.severity === 'error'),
  ).length
  const warnings = rows.filter((row) =>
    row.issues.some((issue) => issue.severity === 'warning'),
  ).length
  const duplicates = rows.filter((row) => row.duplicateReference).length
  return {
    total: rows.length,
    valid: rows.length - invalid,
    invalid,
    warnings,
    duplicates,
    proposedCreates: rows.filter((row) => row.proposedAction === 'create').length,
    proposedUpdates: rows.filter((row) => row.proposedAction === 'update').length,
    skipped: rows.filter((row) => row.proposedAction === 'skip').length,
    ...dataset.preview?.(rows),
  }
}

export function assertImportTransition(from: ImportBatchState, to: ImportBatchState): void {
  const transitions: Record<ImportBatchState, readonly ImportBatchState[]> = {
    received: ['parsed', 'failed', 'cancelled'],
    parsed: ['ready_for_confirmation', 'failed', 'cancelled'],
    ready_for_confirmation: ['processing', 'cancelled'],
    processing: ['completed', 'failed'],
    completed: [],
    failed: [],
    cancelled: [],
  }
  if (!transitions[from].includes(to))
    throw new Error(`Illegal import state transition: ${from} → ${to}.`)
}

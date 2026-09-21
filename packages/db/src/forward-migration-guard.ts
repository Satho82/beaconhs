import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'

export const APPROVED_POST_0043_FINGERPRINT =
  'bcb71c3b36a5bcb138840ae0f471222ccc3b3f0590cbedaa580797c743328400'

export type ForwardMigrationBaseline = {
  canonicalFingerprint: string
  catalogFingerprint: string
  lastMigrationNumber: number
  historicalMigrationHashes: Record<string, string>
  existingTables: string[]
}

export function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

export function validateCanonicalFingerprint(actual: string, baseline: ForwardMigrationBaseline) {
  if (baseline.canonicalFingerprint !== APPROVED_POST_0043_FINGERPRINT) {
    throw new Error('Forward-migration baseline does not use the approved post-0043 fingerprint')
  }
  if (actual !== baseline.catalogFingerprint) {
    throw new Error(`Unexpected canonical schema drift: ${actual}`)
  }
}

export function validateHistoricalMigrations(folder: string, baseline: ForwardMigrationBaseline) {
  const sqlFiles = readdirSync(folder).filter((name) => /^\d{4}_.+\.sql$/.test(name))
  for (const [name, expected] of Object.entries(baseline.historicalMigrationHashes)) {
    const path = resolve(folder, name)
    const actual = sha256(readFileSync(path))
    if (actual !== expected) throw new Error(`Historical migration was modified: ${name}`)
  }
  const numbers = new Map<number, string[]>()
  for (const name of sqlFiles) {
    const number = Number(name.slice(0, 4))
    numbers.set(number, [...(numbers.get(number) ?? []), name])
  }
  for (const [number, names] of numbers) {
    if (names.length > 1)
      throw new Error(`Migration number ${number.toString().padStart(4, '0')} is reused`)
  }
}

function sqlIdentifiers(sql: string, pattern: RegExp) {
  return [...sql.matchAll(pattern)].map((match) =>
    (match[1] ?? '').replaceAll('"', '').split('.').at(-1)!.toLowerCase(),
  )
}

export function validateForwardMigration(
  fileName: string,
  sql: string,
  baseline: ForwardMigrationBaseline,
  allowedObjects: string[],
) {
  const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(basename(fileName))
  if (!match) throw new Error('Forward migration filename is invalid')
  const number = Number(match[1])
  if (number !== baseline.lastMigrationNumber + 1) {
    throw new Error(
      `Expected migration ${String(baseline.lastMigrationNumber + 1).padStart(4, '0')}`,
    )
  }
  const existing = new Set(baseline.existingTables.map((name) => name.toLowerCase()))
  const protectedHospitality = new Set([
    'hospitality_properties',
    'hospitality_rooms',
    'buildings',
    'floors',
    'qr_targets',
    'maintenance_issues',
    'maintenance_issue_source',
  ])
  const created = sqlIdentifiers(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)/gi)
  for (const table of created) {
    if (existing.has(table)) throw new Error(`Forward migration recreates existing table: ${table}`)
    if (protectedHospitality.has(table))
      throw new Error(`Hospitality recreation is forbidden: ${table}`)
  }
  if (/\b(drop\s+(?:table|column|schema|type)|alter\s+table[\s\S]*?drop\s+)/i.test(sql)) {
    throw new Error('Destructive canonical-object changes are forbidden in forward migrations')
  }
  const touched = new Set([
    ...created,
    ...sqlIdentifiers(sql, /alter\s+table\s+(?:if\s+exists\s+)?([^\s;]+)/gi),
    ...sqlIdentifiers(sql, /create\s+(?:unique\s+)?index[^\s]*\s+on\s+([^\s(]+)/gi),
    ...sqlIdentifiers(sql, /on\s+([^\s;]+)\s+(?:for\s+|using\s*\(|with\s+check)/gi),
  ])
  const allowed = new Set(allowedObjects.map((name) => name.toLowerCase()))
  const unrelated = [...touched].filter((name) => !allowed.has(name))
  if (unrelated.length)
    throw new Error(`Unrelated schema objects in forward migration: ${unrelated.join(', ')}`)
  if (!created.length) throw new Error('Forward migration must add at least one new table')
}

export function readForwardMigrationBaseline(path: string): ForwardMigrationBaseline {
  return JSON.parse(readFileSync(path, 'utf8')) as ForwardMigrationBaseline
}

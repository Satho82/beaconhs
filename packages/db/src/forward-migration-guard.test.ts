import { describe, expect, it } from 'vitest'
import {
  APPROVED_POST_0043_FINGERPRINT,
  validateCanonicalFingerprint,
  validateForwardMigration,
  validateHistoricalMigrations,
  type ForwardMigrationBaseline,
} from './forward-migration-guard'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256 } from './forward-migration-guard'

const baseline: ForwardMigrationBaseline = {
  canonicalFingerprint: APPROVED_POST_0043_FINGERPRINT,
  catalogFingerprint: 'catalog-ok',
  lastMigrationNumber: 43,
  historicalMigrationHashes: {},
  existingTables: ['hospitality_properties', 'hospitality_rooms', 'maintenance_issues'],
}

describe('forward migration guard', () => {
  it('accepts the approved canonical fingerprint', () => {
    expect(() => validateCanonicalFingerprint('catalog-ok', baseline)).not.toThrow()
  })

  it('rejects altered canonical state', () => {
    expect(() => validateCanonicalFingerprint('catalog-drift', baseline)).toThrow(/schema drift/i)
  })

  it('rejects existing-table and Hospitality recreation', () => {
    expect(() =>
      validateForwardMigration(
        '0044_bad.sql',
        'CREATE TABLE hospitality_properties (id uuid);',
        baseline,
        ['hospitality_properties'],
      ),
    ).toThrow(/recreates existing table/i)
  })

  it('rejects migration-number reuse', () => {
    expect(() =>
      validateForwardMigration('0043_reused.sql', 'CREATE TABLE risk_items (id uuid);', baseline, [
        'risk_items',
      ]),
    ).toThrow(/expected migration 0044/i)
  })

  it('rejects modified historical migration SQL', () => {
    const folder = mkdtempSync(join(tmpdir(), 'migration-guard-'))
    writeFileSync(join(folder, '0043_history.sql'), 'select 2;')
    expect(() =>
      validateHistoricalMigrations(folder, {
        ...baseline,
        historicalMigrationHashes: { '0043_history.sql': sha256('select 1;') },
      }),
    ).toThrow(/historical migration was modified/i)
  })

  it('rejects unrelated schema changes', () => {
    expect(() =>
      validateForwardMigration(
        '0044_risk.sql',
        'CREATE TABLE risk_items (id uuid); ALTER TABLE users ADD COLUMN surprise text;',
        baseline,
        ['risk_items'],
      ),
    ).toThrow(/unrelated schema objects/i)
  })

  it('accepts a legitimate forward-only migration', () => {
    expect(() =>
      validateForwardMigration(
        '0044_risk.sql',
        'CREATE TABLE risk_items (id uuid); CREATE INDEX risk_items_id_idx ON risk_items (id);',
        baseline,
        ['risk_items'],
      ),
    ).not.toThrow()
  })
})

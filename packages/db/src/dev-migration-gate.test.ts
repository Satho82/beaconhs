import { describe, expect, it } from 'vitest'
import { readFileSync, cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  strictPrefix,
  sourceMigrations,
  validateBackupTarget,
  validateEvidence,
  digest,
  ledgerFingerprint,
  devMigrationFolder,
  type ReleaseEvidence,
  type LedgerRow,
} from './dev-migration-gate'

const files = sourceMigrations(devMigrationFolder)
const rows: LedgerRow[] = files.map((f, i) => ({
  id: i + 1,
  hash: f.hash,
  created_at: String(f.createdAt),
}))
const now = Date.parse('2026-10-12T21:00:00Z')
const identity = {
  sourceSha: 'a'.repeat(40),
  sourceTree: 'b'.repeat(40),
  imageDigest: 'sha256:' + 'c'.repeat(64),
}
function evidence(): ReleaseEvidence {
  const hash = digest('fixture')
  return {
    version: 1,
    ...identity,
    database: 'uvanoo_dev',
    databaseOid: 123,
    postgresVersion: '160015',
    migrations: files,
    schemas: { [files.length]: hash },
    backup: {
      file: 'backup.dump.age',
      sha256: hash,
      createdAt: '2026-10-12T20:50:00Z',
      restoredAt: '2026-10-12T20:55:00Z',
      restoreRun: 'https://github.com/Satho82/beaconhs/actions/runs/123',
      ledgerHash: hash,
      dataHash: hash,
      schemaHash: hash,
      restoredLedgerHash: hash,
      restoredDataHash: hash,
      restoredSchemaHash: hash,
      rollbackImageDigest: identity.imageDigest,
    },
  }
}
describe('strict DEV release migration gate', () => {
  it.each(['sql', 'journal-order', 'timestamp', 'unregistered'])(
    'rejects altered source %s',
    (kind) => {
      const folder = mkdtempSync(resolve(tmpdir(), 'dev-gate-source-'))
      try {
        cpSync(devMigrationFolder, folder, { recursive: true })
        if (kind === 'sql') writeFileSync(resolve(folder, files[0]!.tag + '.sql'), '-- changed')
        if (kind === 'unregistered')
          writeFileSync(resolve(folder, '9999_unregistered.sql'), 'SELECT 1;')
        const path = resolve(folder, 'meta/_journal.json')
        const journal = JSON.parse(readFileSync(path, 'utf8'))
        if (kind === 'journal-order') journal.entries[0].idx = 9
        if (kind === 'timestamp') journal.entries[0].when += 1
        writeFileSync(path, JSON.stringify(journal))
        expect(() => sourceMigrations(folder)).toThrow()
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    },
  )
  it('rejects malformed backup connections without exposing their values', () => {
    const privateValue = 'invalid-backup-credential-value'
    expect(() => validateBackupTarget(privateValue, privateValue)).toThrow(
      'DEV database connection URL rejected',
    )
    try {
      validateBackupTarget(privateValue, privateValue)
    } catch (error) {
      expect(String(error)).not.toContain(privateValue)
    }
    expect(() =>
      validateBackupTarget(
        'postgresql://beaconhs_backup:fixture@host:5432/uvanoo_dev',
        'postgresql://beaconhs_migrator:fixture@host:5432/uvanoo_dev',
      ),
    ).not.toThrow()
    expect(() =>
      validateBackupTarget(
        'postgresql://beaconhs_backup:fixture@other:5432/uvanoo_dev',
        'postgresql://beaconhs_migrator:fixture@host:5432/uvanoo_dev',
      ),
    ).toThrow()
  })
  it('accepts an exact historical prefix and the complete source', () => {
    expect(strictPrefix(files, rows.slice(0, 58))).toBe(58)
    expect(strictPrefix(files, rows)).toBe(files.length)
  })
  it.each(['empty', 'gap', 'duplicate', 'hash', 'timestamp', 'order', 'ahead'])(
    'rejects %s history',
    (kind) => {
      const bad = structuredClone(rows)
      if (kind === 'empty') bad.length = 0
      if (kind === 'gap') bad.splice(10, 1)
      if (kind === 'duplicate') bad[10] = { ...bad[9]! }
      if (kind === 'hash') bad[10]!.hash = '0'.repeat(64)
      if (kind === 'timestamp') bad[10]!.created_at = 1
      if (kind === 'order') [bad[9], bad[10]] = [bad[10]!, bad[9]!]
      if (kind === 'ahead') bad.push({ id: 999, hash: '0'.repeat(64), created_at: 9999999999999 })
      expect(() => strictPrefix(files, bad)).toThrow()
    },
  )
  it('accepts only evidence bound to the exact release', () => {
    expect(() => validateEvidence(evidence(), files, identity, now)).not.toThrow()
    for (const key of ['sourceSha', 'sourceTree', 'imageDigest'] as const) {
      const bad = evidence()
      bad[key] = 'wrong'
      expect(() => validateEvidence(bad, files, identity, now)).toThrow()
    }
    const bad = evidence()
    bad.migrations = files.slice(1)
    expect(() => validateEvidence(bad, files, identity, now)).toThrow()
  })
  it.each(['stale', 'future', 'restore', 'checksum', 'path', 'rollback', 'schema'])(
    'rejects %s recovery evidence',
    (kind) => {
      const bad = evidence()
      if (kind === 'stale') bad.backup.createdAt = '2026-10-11T20:50:00Z'
      if (kind === 'future') bad.backup.restoredAt = '2026-10-13T20:50:00Z'
      if (kind === 'restore') bad.backup.restoredDataHash = '0'.repeat(64)
      if (kind === 'checksum') bad.backup.sha256 = ''
      if (kind === 'path') bad.backup.file = '../backup.dump.age'
      if (kind === 'rollback') bad.backup.rollbackImageDigest = 'latest'
      if (kind === 'schema') bad.schemas = {}
      expect(() => validateEvidence(bad, files, identity, now)).toThrow()
    },
  )
  it('ledger identity cannot hide order changes', () => {
    expect(ledgerFingerprint(rows)).not.toBe(ledgerFingerprint([...rows].reverse()))
  })
  it('requires reviewed evidence and only replaces the DEV execution route', () => {
    const workflow = readFileSync(
      fileURLToPath(new URL('../../../.github/workflows/deploy-dev.yml', import.meta.url)),
      'utf8',
    )
    expect(workflow).not.toContain('clean155')
    expect(workflow).not.toContain('src/verify-prepared-risk.ts')
    expect(workflow).toContain('migration_entrypoint=src/migrate.ts')
    expect(workflow).toContain('migration_entrypoint=src/migrate-dev.ts')
    expect(workflow).toContain('/release-evidence:ro')
    expect(workflow).toContain('inputs.release_evidence_sha256')
    expect(workflow.indexOf('- name: Validate DEV release evidence input')).toBeLessThan(
      workflow.indexOf('- name: Run database migrations'),
    )
  })
  it('keeps the DEV preflight under the canonical lock and before privilege writes', () => {
    const code = readFileSync(fileURLToPath(new URL('./migrate.ts', import.meta.url)), 'utf8')
    expect(code.indexOf('if (devGate) await devGate.before')).toBeGreaterThan(
      code.indexOf('lockAcquired = true'),
    )
    expect(code.indexOf('if (devGate) await devGate.before')).toBeLessThan(
      code.indexOf('await prepareMigrationPrivileges'),
    )
    expect(code.indexOf('if (devGate) await devGate.after')).toBeLessThan(
      code.indexOf('if (lockAcquired)'),
    )
  })
})

[executed on device: vps-c54e0b88 (fc795f58-05bc-455e-8758-99b3f4cc0544)]
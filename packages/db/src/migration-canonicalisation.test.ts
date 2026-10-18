import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readMigrationFiles, validateMigrationState } from './migration-state'

const folder = fileURLToPath(new URL('../drizzle', import.meta.url))
const recorded = JSON.parse(
  readFileSync(new URL('./test/recorded-dev-migration-ledger.json', import.meta.url), 'utf8'),
) as {
  entries: number
  live: { ledger: Array<{ id: number; hash: string; created_at: number }> }
}
describe('canonical chain against independently recorded DEV ledger', () => {
  it('preserves historical 0059 and earlier and explicitly binds pending 0060/0061 corrections', () => {
    const files = readMigrationFiles(folder)
    expect(files).toHaveLength(65)
    expect(
      files
        .slice(0, 59)
        .map((file, index) => ({ id: index + 1, hash: file.hash, created_at: file.createdAt })),
    ).toEqual(recorded.live.ledger.slice(0, 59))
    // Preserve the old evidence, never rewrite it to claim the new hashes ran.
    expect(recorded.live.ledger.slice(59).map((row) => row.hash)).toEqual([
      '870037015142f7764bf0ea1645a65a8152097ae1e14caba28f5096761953915d',
      '967e01c579434a1230124f1659ac451bd4834a46106d27261a7e2fc61e4ba602',
    ])
    expect(files.slice(59, 61).map((file) => file.hash)).toEqual([
      'c65f9ebe3ac4b3e93c7fa0a062eab786cadc4dcfbf67ef62ff0860c9a8d75e33',
      '43d1c71e5260d03264433e8224f324ad8dc56b6dc10053b5610b6e9b27625b47',
    ])
    expect(files.slice(59, 61).map((file) => file.createdAt)).toEqual(
      recorded.live.ledger.slice(59).map((row) => row.created_at),
    )
    // Databases which already applied the old bodies MUST remain rejected.
    expect(() =>
      validateMigrationState(
        files,
        recorded.live.ledger.map((row) => ({ hash: row.hash, createdAt: row.created_at })),
      ),
    ).toThrow()
  })
  it('registers Approvals once after the unchanged recorded baseline', () => {
    const files = readMigrationFiles(folder)
    expect(files[61]).toMatchObject({
      tag: '0062_approvals_batch01',
      createdAt: 1791824400000,
    })
    const proposal = readFileSync(
      new URL('../proposals/approvals-batch01.sql', import.meta.url),
      'utf8',
    )
    const canonical = readFileSync(folder + '/0062_approvals_batch01.sql', 'utf8')
    expect(canonical.split('\n').slice(3).join('\n')).toBe(proposal.split('\n').slice(3).join('\n'))
    expect(files.filter((file) => file.tag === '0062_approvals_batch01')).toHaveLength(1)
  })
  it('has one canonical location and the recorded Risk journal metadata', () => {
    const journal = JSON.parse(readFileSync(folder + '/meta/_journal.json', 'utf8'))
    const tags = [
      '0059_risk_template_draft_state',
      '0060_risk_template_families_manual_assessments',
      '0061_risk_assessment_revisions_archive_signoffs',
    ]
    expect(journal.entries.slice(58, 61)).toEqual(
      tags.map((tag, index) => ({
        idx: 58 + index,
        version: '7',
        when: 1791542400002 + index,
        tag,
        breakpoints: true,
      })),
    )
    for (const tag of tags) {
      expect(existsSync(folder + '/' + tag + '.sql')).toBe(true)
      expect(existsSync(folder + '/prepared/' + tag + '.sql')).toBe(false)
    }
  })
})

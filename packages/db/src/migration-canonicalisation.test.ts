import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readMigrationFiles } from './migration-state'

const folder = fileURLToPath(new URL('../drizzle', import.meta.url))
const recorded = JSON.parse(
  readFileSync(new URL('./test/recorded-dev-migration-ledger.json', import.meta.url), 'utf8'),
) as {
  entries: number
  live: { ledger: Array<{ id: number; hash: string; created_at: number }> }
}
describe('canonical chain against independently recorded DEV ledger', () => {
  it('retains all 61 ordered SQL hashes and timestamps exactly', () => {
    const files = readMigrationFiles(folder)
    expect(files).toHaveLength(61)
    expect(
      files.map((file, index) => ({ id: index + 1, hash: file.hash, created_at: file.createdAt })),
    ).toEqual(recorded.live.ledger)
  })
  it('has one canonical location and the recorded Risk journal metadata', () => {
    const journal = JSON.parse(readFileSync(folder + '/meta/_journal.json', 'utf8'))
    const tags = [
      '0059_risk_template_draft_state',
      '0060_risk_template_families_manual_assessments',
      '0061_risk_assessment_revisions_archive_signoffs',
    ]
    expect(journal.entries.slice(58)).toEqual(
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

// Offline, read-only source binding. Not a live custody or deployment approval.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const product = '563fb0e9b79a838a5f394abaffb2f7dc743fc571'
const foundation = '86db6a4cb7c31272b6865d79e1c18eada379a1c6'
const rehearsal = 'f8934085b4ebf72d66554683ab2a27a4efbbe37c'
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const unchanged = (ref, paths) => assert.equal(git('diff', '--name-only', ref, '--', ...paths), '')
git('merge-base', '--is-ancestor', product, foundation)
git('merge-base', '--is-ancestor', foundation, 'HEAD')
const admissionChanges = new Set(
  [
    'dev-migration-identities.json',
    'dev-migration-gate.ts',
    'dev-logical-catalog.ts',
    'dev-logical-catalog.test.ts',
    'dev-logical-catalog.disposable.ts',
    'dev-temporary-admission.ts',
    'dev-temporary-admission.test.ts',
    'dev-admission-connection.ts',
    'dev-admission-connection.test.ts',
    'migrate.ts',
    'verify-dev-release-admission.ts',
  ].map((name) => `packages/db/src/${name}`),
)
for (const path of git('diff', '--name-only', rehearsal, '--', 'packages/db')
  .split('\n')
  .filter(Boolean))
  assert.ok(admissionChanges.has(path), `Unreviewed database source change: ${path}`)
unchanged(rehearsal, ['packages/db/drizzle'])
for (const path of git('diff', '--name-only', foundation, '--', '.github')
  .split('\n')
  .filter(Boolean))
  assert.ok(
    [
      '.github/workflows/deploy-dev.yml',
      '.github/workflows/deploy-v1.4-dev-candidate.yml',
    ].includes(path),
  )
unchanged(foundation, [
  'apps',
  'packages/auth',
  'packages/tenant',
  'packages/ui',
  'deploy',
  'Dockerfile',
  'pnpm-lock.yaml',
])
const journal = JSON.parse(readFileSync('packages/db/drizzle/meta/_journal.json', 'utf8')).entries
assert.equal(journal.length, 63)
const changed = new Set([
  '0060_risk_template_families_manual_assessments',
  '0061_risk_assessment_revisions_archive_signoffs',
])
const corrected = {
  '0060_risk_template_families_manual_assessments':
    'c65f9ebe3ac4b3e93c7fa0a062eab786cadc4dcfbf67ef62ff0860c9a8d75e33',
  '0061_risk_assessment_revisions_archive_signoffs':
    '43d1c71e5260d03264433e8224f324ad8dc56b6dc10053b5610b6e9b27625b47',
}
for (const item of journal) {
  const path = `packages/db/drizzle/${item.tag}.sql`
  if (!changed.has(item.tag)) unchanged(product, [path])
  else
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), corrected[item.tag])
}
unchanged(product, [
  'packages/db/drizzle/meta/_journal.json',
  'packages/db/src/test/recorded-dev-migration-ledger.json',
])
console.log(
  JSON.stringify(
    {
      source: git('rev-parse', 'HEAD'),
      product,
      foundation,
      rehearsal,
      historicalThrough0059Unchanged: true,
      correctedPendingHashes: corrected,
      rehearsalMigrationSqlIdentical: true,
      productAndAuthUnchanged: true,
      unrelatedWopiTelemetryExcluded: true,
      foundationRuntimeTemplatesUnchanged: true,
      releaseAdmissionChangedRequiresNewValidation: true,
      releaseEvidenceEligible: false,
    },
    null,
    2,
  ),
)

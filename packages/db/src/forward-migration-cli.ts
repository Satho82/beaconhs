import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  readForwardMigrationBaseline,
  sha256,
  validateCanonicalFingerprint,
  validateForwardMigration,
  validateHistoricalMigrations,
} from './forward-migration-guard'

const [dumpPath, migrationPath, allowedCsv = ''] = process.argv.slice(2)
if (!dumpPath || !migrationPath) {
  throw new Error(
    'Usage: forward-migration-cli <canonical-schema.sql> <migration.sql> <allowed,objects>',
  )
}
const root = resolve(import.meta.dirname, '..')
const baseline = readForwardMigrationBaseline(resolve(root, 'drizzle/baseline/post-0043.json'))
validateHistoricalMigrations(resolve(root, 'drizzle'), baseline)
const normalizedDump =
  readFileSync(dumpPath, 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('--') && !/^\\(restrict|unrestrict) /.test(line))
    .join('\n') + '\n'
validateCanonicalFingerprint(sha256(normalizedDump), baseline)
validateForwardMigration(
  migrationPath,
  readFileSync(migrationPath, 'utf8'),
  baseline,
  allowedCsv.split(',').filter(Boolean),
)
console.log('Forward migration guard: PASS')

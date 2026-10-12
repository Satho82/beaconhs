/** Historical enum plan inspection only. Execution is owned by migrate.ts. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function isolated0059Statement(): string {
  const text = readFileSync(
    new URL('../drizzle/0059_risk_template_draft_state.sql', import.meta.url),
    'utf8',
  )
  const statements = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('--') && !line.startsWith('SET '))
  if (
    statements.length !== 1 ||
    statements[0] !== "ALTER TYPE risk_template_state ADD VALUE IF NOT EXISTS 'draft';"
  )
    throw new Error('0059 must contain only the reviewed enum addition')
  return statements[0].slice(0, -1)
}

type Query = (statement: string) => Promise<Array<Record<string, unknown>>>
type Transaction = (run: (query: Query) => Promise<void>) => Promise<void>

/** Explicit refusal for old callers: never create untracked canonical DDL. */
export async function runIsolated0059(transaction: Transaction, ownerRole: string): Promise<void> {
  void transaction
  void ownerRole
  throw new Error('0059 is canonical; use the canonical migration runner')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv[2] === '--plan') {
    isolated0059Statement()
    console.log('0059 canonical enum statement validated offline; execution belongs to migrate.ts')
  } else {
    console.error('Standalone 0059 execution retired; use the canonical migration runner')
    process.exitCode = 1
  }
}

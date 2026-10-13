import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  parseDocuments,
  fingerprint,
} from '../../../docs/v1.4/drift-resolution58-validation/compare.mjs'
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + stable(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'null'
}
const digest = (value) => createHash('sha256').update(stable(value)).digest('hex')
try {
  if (process.versions.node.split('.')[0] !== '24') throw new Error('runtime')
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const docs = parseDocuments(input.metadata)
  const ledger = docs[1].rows.map((r) => ({ ...r, created_at: String(r.created_at) }))
  console.log(
    JSON.stringify({
      ledgerHash: digest(ledger),
      schemaHash: fingerprint(docs),
      dataHash: digest(input.data),
      databaseOid: docs[0].databaseOid,
      ledgerCount: ledger.length,
    }),
  )
} catch {
  console.error('Fingerprint rejected; no confidential metadata printed')
  process.exitCode = 1
}

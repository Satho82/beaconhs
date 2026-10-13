import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
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
export const hash = (x) => createHash('sha256').update(x).digest('hex')
export function parseDocuments(text) {
  const out = []; let start = 0, depth = 0, quoted = false, escaped = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (depth === 0) { if (/\s/.test(c)) { start = i + 1; continue }; assert.equal(c, '{'); depth = 1; start = i; continue }
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue }
    if (c === '"') quoted = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') { depth--; if (depth === 0) out.push(JSON.parse(text.slice(start, i + 1))) }
  }
  assert.equal(depth, 0); assert.equal(quoted, false)
  assert.deepEqual(out.map(x => x.section), ['identity', 'ledger', ...Array.from({length:19}, (_,i)=>i)])
  assert.equal(out[0].database, 'beaconhs'); assert.equal(out[0].postgresVersion, '160015')
  assert.equal(out[1].rows.length, 58)
  for (const x of out.slice(1)) assert.ok(Array.isArray(x.rows))
  return out
}
export function fingerprint(docs) {
  return hash(stable(docs.slice(2).map(s => s.rows.map(stable).sort())))
}
export function publicEvidence(docs, migrations) {
  const sections = docs.slice(2).map(s => ({
    section:s.section, count:s.rows.length, hash:hash(stable(s.rows.map(stable).sort())),
    rows:s.rows.map(r => ({
      identity: Object.fromEntries(Object.entries(r).filter(([k]) => ['nspname','schemaname','relname','tablename','attname','conname','tgname','proname','policyname','rolname','parent','member','typname','enumlabel','evtname','rulename','extname','sequencename'].includes(k))),
      hash:hash(stable(r)),
      fields:Object.fromEntries(Object.entries(r).map(([k,v]) => [k,hash(stable(v))]))
    })).sort((a,b)=>a.hash.localeCompare(b.hash))
  }))
  return {version:1, fingerprint:fingerprint(docs), migrations, sections}
}
export function compare(reference, docs) {
  let previous=0
  for(const [i,row] of docs[1].rows.entries()) {
    const expected=reference.migrations[i]
    assert.ok(Number.isSafeInteger(row.id) && row.id>previous, 'Ledger order rejected')
    assert.equal(row.hash,expected.hash,'Ledger SQL hash mismatch at index '+i)
    assert.equal(Number(row.created_at),expected.createdAt,'Ledger timestamp mismatch at index '+i)
    previous=row.id
  }
  const actual=publicEvidence(docs,reference.migrations)
  const differences=[]
  for(const [i,section] of actual.sections.entries()) {
    const expected=reference.sections[i]
    if(section.hash!==expected.hash) {
      const expectedSet=new Set(expected.rows.map(r=>r.hash))
      const actualSet=new Set(section.rows.map(r=>r.hash))
      differences.push({section:i, expectedCount:expected.count, actualCount:section.count,
        missingOrChanged:expected.rows.filter(r=>!actualSet.has(r.hash)).map(r=>({identity:r.identity,hash:r.hash})),
        unexpectedOrChanged:section.rows.filter(r=>!expectedSet.has(r.hash)).map(r=>{
          const match=expected.rows.filter(e=>stable(e.identity)===stable(r.identity))
          return {identity:r.identity,hash:r.hash,changedFields:match.length===1?Object.keys(r.fields).filter(k=>r.fields[k]!==match[0].fields[k]):['identity absent or ambiguous']}
        })})
    }
  }
  return {ledger:'PASS', canonical:reference.fingerprint, actual:actual.fingerprint, match:reference.fingerprint===actual.fingerprint,differences}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.versions.node.split('.')[0],'24','Use Node.js 24 to match the gate runtime')
    const [referencePath, actualPath, checksum]=process.argv.slice(2)
    assert.match(checksum,/^[a-f0-9]{64}$/)
    const raw=readFileSync(actualPath)
    assert.equal(hash(raw),checksum,'DEV metadata file checksum mismatch')
    const reference=JSON.parse(readFileSync(referencePath,'utf8'))
    assert.equal(reference.sourceSha,'563fb0e9b79a838a5f394abaffb2f7dc743fc571')
    assert.equal(reference.postgresVersion,'160015')
    const result=compare(reference,parseDocuments(raw.toString('utf8')))
    console.log(JSON.stringify(result,null,2))
    process.exitCode=result.match?0:2
  } catch { console.error('Comparison rejected: checksum, format, runtime, reference or ledger validation failed. No raw metadata printed.'); process.exitCode=1 }
}

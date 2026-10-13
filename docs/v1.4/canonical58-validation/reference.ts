import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import postgres from 'postgres'
import { sourceMigrations, strictPrefix, schemaFingerprint } from './dev-migration-gate'
const candidate='563fb0e9b79a838a5f394abaffb2f7dc743fc571'
const historical='d18f635a41f092e9e86aa6f53518f9c28992b0d2'
assert.equal(process.env.CI,'true')
assert.equal(process.env.CANONICAL_DISPOSABLE,'true')
const root=process.cwd(), repo=resolve(root,'../..'), control=process.env.CONTROL_DIR!, output=process.env.REFERENCE_OUT!
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),candidate)
const util=await import(pathToFileURL(resolve(control,'compare.mjs')).href)
const folder=resolve(root,'drizzle'), files=sourceMigrations(folder)
assert.equal(files.length,63)
const work=mkdtempSync(resolve(tmpdir(),'canonical58-'))
cpSync(resolve(root,'src'),resolve(work,'src'),{recursive:true})
cpSync(folder,resolve(work,'drizzle'),{recursive:true})
symlinkSync(resolve(root,'node_modules'),resolve(work,'node_modules'),'dir')
writeFileSync(resolve(work,'package.json'),'{"type":"module"}')
const journal=JSON.parse(readFileSync(resolve(folder,'meta/_journal.json'),'utf8'))
journal.entries=journal.entries.slice(0,58)
writeFileSync(resolve(work,'drizzle/meta/_journal.json'),JSON.stringify(journal))
for(const file of ['migrate.ts','rls.ts'])
  writeFileSync(resolve(work,'src',file),execFileSync('git',['show',historical+':packages/db/src/'+file],{cwd:repo}))
// The historical runner reads the 58-entry temporary journal. SQL bytes remain untouched.
execFileSync(process.execPath,['--import','tsx',resolve(work,'src/migrate.ts')],{cwd:root,env:process.env,stdio:'pipe'})
const client=postgres('postgresql://postgres:postgres@127.0.0.1:5432/beaconhs',{max:1,onnotice:()=>undefined})
try {
  const version=await client.unsafe("SELECT current_setting('server_version_num') v")
  assert.equal(version[0]!.v,'160015')
  const ledger=await client.unsafe('SELECT id,hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY id')
  assert.equal(strictPrefix(files,ledger.map(r=>({id:Number(r.id),hash:String(r.hash),created_at:String(r.created_at)}))),58)
  const raw=execFileSync('psql',['-X','-w','-qAt','-h','127.0.0.1','-U','postgres','-d','beaconhs','-v','ON_ERROR_STOP=1','-f',resolve(control,'export-metadata.sql')],{env:{...process.env,PGPASSWORD:'postgres'},maxBuffer:32*1024*1024})
  writeFileSync(resolve(output,'canonical-private.jsonl'),raw,{mode:0o600})
  const docs=util.parseDocuments(raw.toString('utf8'))
  const fp=await schemaFingerprint(async s=>Array.from(await client.unsafe(s)))
  assert.equal(util.fingerprint(docs),fp,'Offline algorithm differs from gate')
  const evidence=util.publicEvidence(docs,files.slice(0,58))
  assert.equal(util.compare(evidence,docs).match,true)
  const mutated=structuredClone(docs); mutated[2].rows[0].owner='unexpected_owner'
  assert.equal(util.compare(evidence,mutated).match,false)
  const alteredLedger=structuredClone(docs); alteredLedger[1].rows[0].hash='0'.repeat(64)
  assert.throws(()=>util.compare(evidence,alteredLedger))
  assert.throws(()=>util.parseDocuments(raw.toString('utf8').slice(0,-20)))
  const counts=await client.unsafe("SELECT count(*)::int tables,count(*) FILTER(WHERE relrowsecurity)::int rls,count(*) FILTER(WHERE relforcerowsecurity)::int force FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')")
  const triggers=await client.unsafe("SELECT count(*)::int total,count(*) FILTER(WHERE tgenabled='D')::int disabled FROM pg_trigger WHERE NOT tgisinternal")
  const exceptions=await client.unsafe("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity ORDER BY c.relname")
  assert.deepEqual(exceptions.map(r=>r.relname),['account','configuration_master_versions','configuration_masters','platform_audit_log','platform_settings','session','tenants','user','verification'])
  assert.equal(triggers[0]!.disabled,0)
  const summary={...evidence,sourceSha:candidate,sourceTree:'324c50a60e2cb0639ba920488a150c6531968374',historicalSource:historical,postgresVersion:'160015',imageDigest:process.env.POSTGRES_IMAGE,workflowSha:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,rawChecksum:util.hash(raw),counts:counts[0],triggers:triggers[0],policies:docs[8].rows.length,ledgerVerification:'58 exact ordered SQL SHA256/timestamp matches',algorithmVerification:'matches candidate schemaFingerprint; mutation/ledger/truncation rejection tests passed'}
  writeFileSync(resolve(output,'reference-public.json'),JSON.stringify(summary,null,2)+'\n')
  console.log('REFERENCE_RESULT '+JSON.stringify({...summary,sections:undefined,migrations:undefined}))
} finally { await client.end() }

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import postgres from 'uvanoo_dev'
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
mkdirSync(resolve(work,'src'),{recursive:true})
execFileSync('tar',['-x','--strip-components=3','-C',resolve(work,'src')],{input:execFileSync('git',['archive',historical,'packages/db/src'],{cwd:repo,maxBuffer:64*1024*1024})})
cpSync(folder,resolve(work,'drizzle'),{recursive:true})
symlinkSync(resolve(root,'node_modules'),resolve(work,'node_modules'),'dir')
writeFileSync(resolve(work,'package.json'),'{"type":"module"}')
const journal=JSON.parse(readFileSync(resolve(folder,'meta/_journal.json'),'utf8'))
journal.entries=journal.entries.slice(0,58)
writeFileSync(resolve(work,'drizzle/meta/_journal.json'),JSON.stringify(journal))
// The historical runner reads the 58-entry temporary journal. SQL bytes remain untouched.
execFileSync(process.execPath,['--import','tsx',resolve(work,'src/migrate.ts')],{cwd:root,env:process.env,stdio:'pipe'})
const client=postgres('postgresql://uvanoo_dev:postgres@127.0.0.1:5432/beaconhs',{max:1,onnotice:()=>undefined})
try {
  const version=await client.unsafe("SELECT current_setting('server_version_num') v")
  assert.equal(version[0]!.v,'160015')
  const ledger=await client.unsafe('SELECT id,hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY id')
  assert.equal(strictPrefix(files,ledger.map(r=>({id:Number(r.id),hash:String(r.hash),created_at:String(r.created_at)}))),58)
  const raw=execFileSync('psql',['-X','-w','-qAt','-h','127.0.0.1','-U','uvanoo_dev','-d','beaconhs','-v','ON_ERROR_STOP=1','-f',resolve(control,'export-metadata.sql')],{env:{...process.env,PGPASSWORD:'postgres'},maxBuffer:32*1024*1024})
  writeFileSync(resolve(output,'canonical-private.jsonl'),raw,{mode:0o600})
  const docs=util.parseDocuments(raw.toString('utf8'))
  const typedSections: unknown[][]=[]
  const fp=await schemaFingerprint(async s=>{const rows=Array.from(await client.unsafe(s)); typedSections.push(rows); return rows})
  if(util.fingerprint(docs)!==fp) {
    const typedDocs=[docs[0],docs[1],...typedSections.map((rows,section)=>({section,rows}))]
    console.log('TYPE_DIAGNOSTIC '+JSON.stringify(util.compare(util.publicEvidence(typedDocs,files.slice(0,58)),docs)))
  }
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
  const extensions=await client.unsafe("SELECT extname,extversion,pg_get_userbyid(extowner) owner FROM pg_extension ORDER BY extname")
  assert.deepEqual(extensions.map(r=>[r.extname,r.extversion,r.owner]),[['pg_trgm','1.6','uvanoo_dev'],['pgcrypto','1.3','uvanoo_dev'],['plpgsql','1.0','uvanoo_dev']])
  const etl=await client.unsafe("SELECT has_schema_privilege('beaconhs_app','etl','USAGE') app,has_schema_privilege('beaconhs_super','etl','CREATE') super,has_schema_privilege('beaconhs_backup','etl','USAGE') backup")
  assert.deepEqual({...etl[0]},{app:false,super:true,backup:true})
  const publicDefaults=await client.unsafe("SELECT count(*)::int n FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public'")
  assert.equal(publicDefaults[0]!.n,0)
  const bootstrap=await client.unsafe("SELECT oid,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='uvanoo_dev'")
  assert.equal(Number(bootstrap[0]!.oid),10)
  for(const k of ['rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolcanlogin','rolreplication','rolbypassrls']) assert.equal(bootstrap[0]![k],true)
  const dependencies=await client.unsafe("SELECT e.extname,d.classid::regclass::text object_catalog,count(*)::int member_count FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.refclassid='pg_extension'::regclass AND d.deptype='e' GROUP BY e.extname,d.classid ORDER BY e.extname,object_catalog")
  assert.deepEqual(dependencies.map(r=>[r.extname,r.object_catalog,r.member_count]),[['pg_trgm','pg_opclass',2],['pg_trgm','pg_operator',10],['pg_trgm','pg_opfamily',2],['pg_trgm','pg_proc',31],['pg_trgm','pg_type',1],['pgcrypto','pg_proc',36],['plpgsql','pg_language',1],['plpgsql','pg_proc',3]])
  const arrayDependency=await client.unsafe("SELECT d.deptype FROM pg_type t JOIN pg_depend d ON d.classid='pg_type'::regclass AND d.objid=t.oid JOIN pg_type b ON d.refclassid='pg_type'::regclass AND d.refobjid=b.oid WHERE t.typname='_gtrgm' AND b.typname='gtrgm'")
  assert.deepEqual(arrayDependency.map(r=>r.deptype),['i'])
  // Build a controlled drift fixture only from the historical provisioning SQL.
  const provision=execFileSync('git',['show',historical+':scripts/cluster/provision.sql'],{cwd:repo,encoding:'utf8'})
  const grants=provision.match(/ALTER DEFAULT PRIVILEGES FOR ROLE beaconhs_owner IN SCHEMA public\n[^;]+;/g)!
  assert.equal(grants.length,4)
  for(const grant of grants) await client.unsafe(grant)
  const dirtyFingerprint=await schemaFingerprint(async s=>Array.from(await client.unsafe(s)))
  assert.notEqual(dirtyFingerprint,fp)
  const correction=readFileSync(resolve(control,'proposed-default-acl-correction.sql'),'utf8')
  const statements=correction.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean)
  assert.equal(statements.length,2)
  const reconcile=async (tx:any)=>{
    const lock=await tx.unsafe("SELECT pg_try_advisory_xact_lock(hashtext('beaconhs:schema-migration')) locked")
    assert.equal(lock[0].locked,true)
    await tx.unsafe("SET LOCAL ROLE beaconhs_owner")
    assert.equal(await schemaFingerprint(async s=>Array.from(await tx.unsafe(s))),dirtyFingerprint)
    for(const statement of statements) await tx.unsafe(statement)
    assert.equal(await schemaFingerprint(async s=>Array.from(await tx.unsafe(s))),fp)
  }
  const rollbackSentinel=new Error('deliberate rollback test')
  await assert.rejects(client.begin(async tx=>{await reconcile(tx);throw rollbackSentinel}),e=>e===rollbackSentinel)
  assert.equal(await schemaFingerprint(async s=>Array.from(await client.unsafe(s))),dirtyFingerprint)
  await client.begin(async tx=>{await reconcile(tx)})
  const after=await schemaFingerprint(async s=>Array.from(await client.unsafe(s)))
  assert.equal(after,fp,'All 19 sections must equal independent canonical baseline after correction')
  const finalLedger=await client.unsafe('SELECT id,hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY id')
  assert.deepEqual(finalLedger,ledger)
  const remediation={fixtureSource:historical+':scripts/cluster/provision.sql',baselineFingerprint:fp,driftFixtureFingerprint:dirtyFingerprint,correctedFingerprint:after,all19SectionsRestored:true,rollbackPreservedDrift:true,ledgerUnchanged:true,sqlSha256:util.hash(correction),extensionDependencies:dependencies,bootstrapOid:10,profileApproval:'PENDING OWNER APPROVAL; independently generated, not adopted from DEV'}
  const summary={...evidence,remediation,sourceSha:candidate,sourceTree:'324c50a60e2cb0639ba920488a150c6531968374',historicalSource:historical,postgresVersion:'160015',imageDigest:process.env.POSTGRES_IMAGE,workflowSha:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,rawChecksum:util.hash(raw),counts:counts[0],triggers:triggers[0],policies:docs.find((d:any)=>d.section===8).rows.length,bootstrapRole:'uvanoo_dev',provisioningContract:'historical scripts/cluster/provision.sql before historical migration runner and RLS installer',ledgerVerification:'58 exact ordered SQL SHA256/timestamp matches',algorithmVerification:'matches candidate schemaFingerprint; mutation/ledger/truncation rejection tests passed'}
  writeFileSync(resolve(output,'reference-public.json'),JSON.stringify(summary,null,2)+'\n')
  console.log('PUBLIC_FILE_SHA256 '+util.hash(readFileSync(resolve(output,'reference-public.json'))))
  console.log('REFERENCE_RESULT '+JSON.stringify({...summary,sections:undefined,migrations:undefined}))
} finally { await client.end() }

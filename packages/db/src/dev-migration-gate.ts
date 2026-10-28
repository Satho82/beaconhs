import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import type { MigrationDatabase } from './migration-connection'
import { readMigrationFiles, type MigrationFile } from './migration-state'
import identities from './dev-migration-identities.json'
import { admissionConnection } from './dev-admission-connection'
import { LOGICAL_SCHEMA_PROFILE, logicalCatalog } from './dev-logical-catalog'
import {
  checkTemporaryFiles,
  privateEvidenceFile,
  requireTemporaryDatabaseTarget,
  type AdmissionPhase,
  type TemporaryAdmission,
} from './dev-temporary-admission'

export type Query = (statement: string) => Promise<Record<string, unknown>[]>
export type LedgerRow = {
  id: number
  hash: string
  created_at: string | number
}
export type ReleaseEvidence = {
  version: 1 | 2
  schemaProfile?: typeof LOGICAL_SCHEMA_PROFILE
  admission?: TemporaryAdmission
  sourceSha: string
  sourceTree: string
  imageDigest: string
  database: string
  databaseOid: number
  postgresVersion: string
  migrations: MigrationFile[]
  schemas: Record<string, string>
  backup: {
    file: string
    sha256: string
    createdAt: string
    restoredAt: string
    restoreRun: string
    ledgerHash: string
    dataHash: string
    schemaHash: string
    restoredLedgerHash: string
    restoredDataHash: string
    restoredSchemaHash: string
    rollbackImageDigest: string
  }
}
const hashPattern = /^[a-f0-9]{64}$/
export function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}
function stable(value: unknown): string {
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
export function strictPrefix(files: MigrationFile[], rows: LedgerRow[]): number {
  if (!files.length || !rows.length || rows.length > files.length)
    throw new Error('DEV ledger is empty or ahead of the approved source')
  let previous = 0
  for (const [i, row] of rows.entries()) {
    const expected = files[i]
    if (
      !Number.isSafeInteger(row.id) ||
      row.id <= previous ||
      !expected ||
      row.hash !== expected.hash ||
      Number(row.created_at) !== expected.createdAt
    )
      throw new Error('DEV migration ledger is not an exact ordered source prefix')
    previous = row.id
  }
  return rows.length
}
export function sourceMigrations(folder: string): MigrationFile[] {
  const journal = JSON.parse(readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8'))
  const files = readMigrationFiles(folder)
  if (files.length < 61) throw new Error('DEV target predates the governed migration baseline')
  const disk = readdirSync(folder)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
  if (stable(disk) !== stable(files.map((f) => f.tag + '.sql').sort()))
    throw new Error('DEV source contains unregistered or missing SQL')
  for (const [i, file] of files.entries()) {
    if (
      journal.entries[i].idx !== i ||
      journal.entries[i].version !== '7' ||
      journal.entries[i].breakpoints !== true
    )
      throw new Error('DEV journal order rejected')
    const locked = identities[i]
    if (locked) {
      const bytes = readFileSync(resolve(folder, file.tag + '.sql'))
      const blob = createHash('sha1')
        .update('blob ' + bytes.length + '\0')
        .update(bytes)
        .digest('hex')
      if (file.tag !== locked.tag || file.createdAt !== locked.when || blob !== locked.blob)
        throw new Error('DEV immutable historical migration identity changed')
    }
  }
  return files
}
export function validateEvidence(
  evidence: ReleaseEvidence,
  files: MigrationFile[],
  expected: { sourceSha: string; sourceTree: string; imageDigest: string },
  now = Date.now(),
): void {
  if (
    ![1, 2].includes(evidence.version) ||
    (evidence.version === 1 &&
      (evidence.admission !== undefined || evidence.schemaProfile !== undefined)) ||
    (evidence.version === 2 &&
      (evidence.schemaProfile !== LOGICAL_SCHEMA_PROFILE || !evidence.admission)) ||
    !/^[a-f0-9]{40}$/.test(expected.sourceSha) ||
    !/^[a-f0-9]{40}$/.test(expected.sourceTree) ||
    !/^sha256:[a-f0-9]{64}$/.test(expected.imageDigest) ||
    evidence.sourceSha !== expected.sourceSha ||
    evidence.sourceTree !== expected.sourceTree ||
    evidence.imageDigest !== expected.imageDigest ||
    stable(evidence.migrations) !== stable(files)
  )
    throw new Error('DEV release evidence source/image identity rejected')
  const b = evidence.backup
  const created = Date.parse(b.createdAt)
  const restored = Date.parse(b.restoredAt)
  if (
    !Number.isFinite(created) ||
    !Number.isFinite(restored) ||
    created > restored ||
    restored > now ||
    now - created > 60 * 60 * 1000 ||
    !/^[a-zA-Z0-9_-]+\.dump\.age$/.test(b.file) ||
    !hashPattern.test(b.sha256) ||
    !hashPattern.test(b.ledgerHash) ||
    !hashPattern.test(b.dataHash) ||
    !hashPattern.test(b.schemaHash) ||
    b.restoredLedgerHash !== b.ledgerHash ||
    b.restoredDataHash !== b.dataHash ||
    b.restoredSchemaHash !== b.schemaHash ||
    !(evidence.version === 1
      ? /^https:\/\/github\.com\/Satho82\/beaconhs\/actions\/runs\/[0-9]+$/.test(b.restoreRun)
      : /^private:[a-zA-Z0-9_-]{8,100}$/.test(b.restoreRun)) ||
    !/^sha256:[a-f0-9]{64}$/.test(b.rollbackImageDigest)
  )
    throw new Error('DEV verified encrypted backup/restore readiness rejected')
  if (
    !Object.values(evidence.schemas).every((h) => hashPattern.test(h)) ||
    !hashPattern.test(evidence.schemas[String(files.length)] ?? '')
  )
    throw new Error('DEV trusted target schema evidence missing')
}
const userSchema = "n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'"
/** Catalogue only. No pg_dump, DDL, seed, grants, or application changes. */
export async function schemaFingerprint(
  query: Query,
  profile?: typeof LOGICAL_SCHEMA_PROFILE,
): Promise<string> {
  const sections = [
    'SELECT pg_get_userbyid(datdba) owner,datacl::text acl,datconnlimit,datallowconn FROM pg_database WHERE datname=current_database()',
    'SELECT n.nspname,pg_get_userbyid(n.nspowner) owner,n.nspacl::text acl FROM pg_namespace n WHERE ' +
      userSchema,
    'SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,c.relacl::text acl,c.reloptions,c.relispartition,pg_get_expr(c.relpartbound,c.oid) partition_bound FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ' +
      userSchema,
    'SELECT n.nspname,c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attidentity,a.attgenerated,a.attstorage,a.attcompression,(SELECT collname FROM pg_collation WHERE oid=a.attcollation) collation,a.attacl::text acl,pg_get_expr(d.adbin,d.adrelid) expression FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped AND ' +
      userSchema,
    'SELECT n.nspname,c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid,true) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ' +
      userSchema,
    'SELECT n.nspname,c.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) definition FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ' +
      userSchema,
    'SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND ' +
      userSchema,
    "SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p') AND " +
      userSchema +
      " AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')",
    "SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname NOT LIKE 'pg_%'",
    "SELECT n.nspname,c.relname,pg_get_viewdef(c.oid,true) definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m') AND " +
      userSchema,
    'SELECT n.nspname,t.typname,t.typtype,pg_get_userbyid(t.typowner) owner,t.typacl::text acl,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_enum e ON e.enumtypid=t.oid WHERE ' +
      userSchema +
      " AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e')",
    "SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_roles WHERE rolname LIKE 'beaconhs_%'",
    "SELECT p.rolname parent,m.rolname member,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles p ON p.oid=a.roleid JOIN pg_roles m ON m.oid=a.member WHERE p.rolname LIKE 'beaconhs_%' OR m.rolname LIKE 'beaconhs_%'",
    "SELECT pg_get_userbyid(d.defaclrole) owner,coalesce(n.nspname,'') schema,d.defaclobjtype,d.defaclacl::text acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE pg_get_userbyid(d.defaclrole) LIKE 'beaconhs_%'",
    'SELECT e.evtname,e.evtevent,e.evtenabled,e.evttags,pg_get_userbyid(e.evtowner) owner,e.evtfoid::regprocedure::text function FROM pg_event_trigger e',
    'SELECT n.nspname,c.relname,r.rulename,pg_get_ruledef(r.oid,true) definition FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ' +
      userSchema,
    'SELECT n.nspname,t.typname,k.conname,pg_get_constraintdef(k.oid,true) definition FROM pg_constraint k JOIN pg_type t ON t.oid=k.contypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE ' +
      userSchema,
    'SELECT extname,extversion,pg_get_userbyid(extowner) owner FROM pg_extension',
    "SELECT schemaname,sequencename,sequenceowner,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size FROM pg_sequences WHERE schemaname NOT LIKE 'pg_%'",
  ]
  const results: Record<string, unknown>[][] = []
  for (const statement of sections) results.push(await query(statement))
  if (profile !== undefined && profile !== LOGICAL_SCHEMA_PROFILE)
    throw new Error('DEV schema profile rejected')
  return digest(
    stable(
      profile === LOGICAL_SCHEMA_PROFILE
        ? logicalCatalog(results)
        : results.map((rows) => rows.map(stable).sort()),
    ),
  )
}
export async function dataFingerprint(query: Query): Promise<string> {
  const tables = await query(
    "SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','m') AND n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN ('information_schema','drizzle') ORDER BY n.nspname,c.relname",
  )
  const result = []
  const quote = (s: unknown) => '"' + String(s).replaceAll('"', '""') + '"'
  for (const table of tables) {
    const relation = quote(table.nspname) + '.' + quote(table.relname)
    const rows = await query(
      "SELECT count(*)::text count,md5(coalesce(string_agg(h,'' ORDER BY h),'')) hash FROM (SELECT md5(to_jsonb(t)::text) h FROM " +
        relation +
        ' t) q',
    )
    result.push([table.nspname, table.relname, rows])
  }
  result.push([
    'sequences',
    await query(
      "SELECT schemaname,sequencename,last_value FROM pg_sequences WHERE schemaname NOT LIKE 'pg_%' ORDER BY schemaname,sequencename",
    ),
  ])
  return digest(stable(result))
}
export async function readLedger(query: Query): Promise<LedgerRow[]> {
  const rows = await query(
    'SELECT id,hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY id',
  )
  return rows.map((r) => ({
    id: Number(r.id),
    hash: String(r.hash),
    created_at: String(r.created_at),
  }))
}
export function ledgerFingerprint(rows: LedgerRow[]): string {
  return digest(stable(rows.map((r) => ({ ...r, created_at: String(r.created_at) }))))
}
export async function verifyState(
  query: Query,
  evidence: ReleaseEvidence,
  files: MigrationFile[],
  complete: boolean,
): Promise<LedgerRow[]> {
  const [identity] = await query(
    "SELECT current_database() name,(SELECT oid::integer FROM pg_database WHERE datname=current_database()) oid,current_setting('server_version_num') version",
  )
  if (
    identity?.name !== evidence.database ||
    identity?.oid !== evidence.databaseOid ||
    identity?.version !== evidence.postgresVersion
  )
    throw new Error('DEV database identity rejected')
  const rows = await readLedger(query)
  const prefix = strictPrefix(files, rows)
  if (complete && prefix !== files.length) throw new Error('DEV target migration suffix incomplete')
  const actual = await schemaFingerprint(query, evidence.schemaProfile)
  if (actual !== evidence.schemas[String(prefix)])
    throw new Error('DEV schema/security drift rejected')
  if (
    !complete &&
    (ledgerFingerprint(rows) !== evidence.backup.ledgerHash ||
      actual !== evidence.backup.schemaHash)
  )
    throw new Error('DEV backup does not cover current state')
  return rows
}
export function validateBackupTarget(backupUrl: string, migrationUrl: string): void {
  let backupIdentity: URL
  let migrationIdentity: URL
  try {
    backupIdentity = new URL(backupUrl)
    migrationIdentity = new URL(migrationUrl)
  } catch {
    throw new Error('DEV database connection URL rejected')
  }
  if (
    backupIdentity.protocol !== 'postgresql:' ||
    !backupIdentity.password ||
    backupIdentity.hostname !== migrationIdentity.hostname ||
    backupIdentity.port !== migrationIdentity.port ||
    backupIdentity.pathname !== migrationIdentity.pathname ||
    decodeURIComponent(backupIdentity.username) !== 'beaconhs_backup'
  )
    throw new Error('DEV backup connection target rejected')
}

export async function loadDevMigrationGate(folder: string, phase: AdmissionPhase = 'migration') {
  const evidencePath = process.env.DEV_RELEASE_EVIDENCE_PATH
  const expectedDigest = process.env.DEV_RELEASE_EVIDENCE_SHA256 ?? ''
  if (!evidencePath || !hashPattern.test(expectedDigest))
    throw new Error('DEV approved release evidence required')
  const bytes = readFileSync(evidencePath)
  if (digest(bytes) !== expectedDigest) throw new Error('DEV evidence checksum mismatch')
  const evidence = JSON.parse(bytes.toString('utf8')) as ReleaseEvidence
  if (evidence.version === 1 && process.env.DEV_TEMPORARY_APPROVAL_SHA256)
    throw new Error('DEV temporary approval cannot downgrade the evidence contract')
  const directory = resolve(evidencePath, '..')
  if (
    evidence.version === 2 &&
    privateEvidenceFile(directory, 'manifest.json').compare(bytes) !== 0
  )
    throw new Error('DEV evidence path rejected')
  const files = sourceMigrations(folder)
  const git = (arg: string) =>
    execFileSync('git', ['-c', 'safe.directory=/workspace', 'rev-parse', arg], {
      encoding: 'utf8',
    }).trim()
  execFileSync('git', ['-c', 'safe.directory=/workspace', 'diff', '--exit-code'], { stdio: 'pipe' })
  execFileSync('git', ['-c', 'safe.directory=/workspace', 'diff', '--cached', '--exit-code'], {
    stdio: 'pipe',
  })
  const sourceSha = git('HEAD')
  const sourceTree = git('HEAD^{tree}')
  if (sourceSha !== process.env.DEPLOY_SOURCE_SHA) throw new Error('DEV checkout source mismatch')
  const admit = () => {
    validateEvidence(evidence, files, {
      sourceSha,
      sourceTree,
      imageDigest: process.env.IMAGE_DIGEST ?? '',
    })
    if (evidence.version === 2) checkTemporaryFiles(evidence, directory, phase)
  }
  admit()
  if (evidence.database !== 'uvanoo_dev')
    throw new Error('DEV persistent database must be uvanoo_dev')
  const archive =
    evidence.version === 2
      ? privateEvidenceFile(directory, evidence.backup.file)
      : readFileSync(resolve(directory, evidence.backup.file))
  if (
    !archive.toString('utf8', 0, 32).startsWith('age-encryption.org/v1\n') ||
    digest(archive) !== evidence.backup.sha256
  )
    throw new Error('DEV encrypted backup format/checksum mismatch')
  const backupUrl = process.env.DEV_BACKUP_DATABASE_URL
  if (!backupUrl) throw new Error('DEV backup-role connection required')
  validateBackupTarget(backupUrl, process.env.MIGRATION_DATABASE_URL ?? '')
  if (evidence.version === 2) {
    requireTemporaryDatabaseTarget(backupUrl, 'beaconhs_backup')
    requireTemporaryDatabaseTarget(process.env.MIGRATION_DATABASE_URL ?? '', 'beaconhs_migrator')
  }
  return {
    guard: (db: MigrationDatabase) =>
      evidence.version === 2 ? admissionConnection(db, admit) : db,
    verifyWeb: async () => {
      if (phase !== 'web') throw new Error('DEV web admission phase required')
      const client = postgres(backupUrl, {
        max: 1,
        prepare: false,
        onnotice: () => undefined,
      })
      try {
        await client.begin('isolation level repeatable read read only', async (tx) => {
          const query: Query = async (statement) =>
            Array.from(await tx.unsafe(statement)) as Record<string, unknown>[]
          await verifyState(query, evidence, files, true)
        })
      } finally {
        await client.end()
      }
      admit()
    },
    before: async (db: MigrationDatabase) => {
      admit()
      const query: Query = async (statement) =>
        Array.from(await db.execute(sql.raw(statement))) as Record<string, unknown>[]
      await verifyState(query, evidence, files, false)
      const backup = postgres(backupUrl, {
        max: 1,
        prepare: false,
        onnotice: () => undefined,
      })
      try {
        await backup.begin('isolation level repeatable read read only', async (tx) => {
          const [role] = await tx.unsafe(
            "SELECT current_user name,rolsuper,rolbypassrls,current_setting('transaction_read_only') readonly FROM pg_roles WHERE rolname=current_user",
          )
          if (
            role?.name !== 'beaconhs_backup' ||
            role.rolsuper ||
            !role.rolbypassrls ||
            role.readonly !== 'on'
          )
            throw new Error('DEV backup role rejected')
          const backupQuery: Query = async (s) =>
            Array.from(await tx.unsafe(s)) as Record<string, unknown>[]
          if ((await dataFingerprint(backupQuery)) !== evidence.backup.dataHash)
            throw new Error('DEV data changed since verified backup')
        })
      } finally {
        await backup.end()
      }
      admit()
    },
    after: async (db: MigrationDatabase) => {
      const query: Query = async (statement) =>
        Array.from(await db.execute(sql.raw(statement))) as Record<string, unknown>[]
      await verifyState(query, evidence, files, true)
      admit()
    },
  }
}
export const devMigrationFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

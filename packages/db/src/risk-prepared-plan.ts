/** Offline only: emit a separately reviewed psql plan; never connect or apply. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readMigrationFiles } from './migration-state'
import { isolated0059Statement } from './risk-0059-runner'
import { RLS_POLICY_SQL } from './rls'

const folder = fileURLToPath(new URL('../drizzle', import.meta.url))
export const preparedRiskProposals = [
  [
    '0059_risk_template_draft_state',
    1791542400002,
    '049a5465885f59b8a3d582d20ccb8e3f742b79c0133718a8ec8c1e506e53ff4b',
  ],
  [
    '0060_risk_template_families_manual_assessments',
    1791542400003,
    '870037015142f7764bf0ea1645a65a8152097ae1e14caba28f5096761953915d',
  ],
  [
    '0061_risk_assessment_revisions_archive_signoffs',
    1791542400004,
    '967e01c579434a1230124f1659ac451bd4834a46106d27261a7e2fc61e4ba602',
  ],
] as const

export function preparedRiskPlan(database: string): string {
  // A literal, independently verified database identity is mandatory, not a URL.
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(database)) throw new Error('Invalid target database')
  const canonical = readMigrationFiles(folder)
  const baseline = canonical.slice(0, 58)
  if (
    canonical.length !== 61 ||
    baseline.length !== 58 ||
    baseline.at(-1)?.tag !== '0058_platform_regional_defaults'
  ) {
    throw new Error('Expected canonical 0061 journal with unchanged 0058 prefix')
  }
  isolated0059Statement()
  const stages = preparedRiskProposals.map(([tag, createdAt, hash]) => {
    const body = readFileSync(`${folder}/${tag}.sql`, 'utf8')
    if (
      createHash('sha256').update(body).digest('hex') !== hash ||
      !canonical.some(
        (entry) => entry.tag === tag && entry.createdAt === createdAt && entry.hash === hash,
      )
    )
      throw new Error('Prepared source hash mismatch')
    return { tag, createdAt, hash, body }
  })
  const ledgerGuard = (entries: typeof baseline) => `DO $guard$ BEGIN
    IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> ${entries.length} OR EXISTS (
      SELECT 1 FROM (VALUES ${entries.map((e) => `(${e.createdAt}::bigint,'${e.hash}'::text)`).join(',')}) expected(created_at,hash)
      LEFT JOIN drizzle.__drizzle_migrations actual USING(created_at,hash)
      WHERE actual.hash IS NULL
    ) THEN RAISE EXCEPTION 'RISK_LEDGER_MISMATCH'; END IF;
  END $guard$;`
  const sections = [
    '-- REVIEW REQUIRED. Offline-generated plan, not execution authorization.',
    '-- psql -X -v ON_ERROR_STOP=1; ONE connection; never --single-transaction.',
    '-- Requires approved writer fence, target identity, recovery and role checks.',
    '-- Stop on any error. No automatic resume, retry, down migration or ledger repair.',
    '-- Writes three explicit ledger rows; does NOT edit the ordinary source journal.',
    '-- Historical 58-to-61 application plan; ordinary migrate.ts now consumes the canonical 61-entry journal.',
    '\\set ON_ERROR_STOP on',
    "SET lock_timeout='5s'; SET statement_timeout='120s';",
    `DO $guard$ BEGIN
      IF current_database() <> '${database}' OR session_user <> 'beaconhs_migrator' THEN RAISE EXCEPTION 'RISK_TARGET_MISMATCH'; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=session_user AND NOT rolsuper AND NOT rolbypassrls)
        OR NOT pg_has_role(session_user,'beaconhs_owner','MEMBER')
        OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='beaconhs_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
      THEN RAISE EXCEPTION 'RISK_ROLE_MISMATCH'; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='beaconhs_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT pg_has_role(oid,'beaconhs_owner','MEMBER'))
        OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='beaconhs_super' AND rolcanlogin AND NOT rolsuper AND rolbypassrls AND NOT pg_has_role(oid,'beaconhs_owner','MEMBER'))
        OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='beaconhs_backup' AND rolcanlogin AND NOT rolsuper AND rolbypassrls AND NOT pg_has_role(oid,'beaconhs_owner','MEMBER') AND rolconfig @> ARRAY['default_transaction_read_only=on'])
      THEN RAISE EXCEPTION 'RISK_RUNTIME_ROLES_MISMATCH'; END IF;
      IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND pg_get_userbyid(c.relowner)<>'beaconhs_owner')
      THEN RAISE EXCEPTION 'RISK_OWNERSHIP_MISMATCH'; END IF;
    END $guard$;`,
    "SELECT pg_advisory_lock(hashtext('beaconhs:schema-migration'));",
    'SET ROLE beaconhs_owner; SET search_path=public,pg_catalog;',
    ledgerGuard(baseline),
  ]
  for (const [index, stage] of stages.entries()) {
    sections.push('BEGIN;', ledgerGuard([...baseline, ...stages.slice(0, index)]))
    if (index === 0)
      sections.push(`DO $guard$ BEGIN
      IF to_regclass('public.risk_templates') IS NULL OR to_regclass('public.risk_template_families') IS NOT NULL
        OR to_regclass('public.risk_assessment_versions') IS NOT NULL THEN RAISE EXCEPTION 'RISK_SCHEMA_MISMATCH'; END IF;
    END $guard$;`)
    if (index === 1)
      sections.push(`DO $guard$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname='public' AND t.typname='risk_template_state' AND e.enumlabel='draft')
      THEN RAISE EXCEPTION 'RISK_ENUM_NOT_COMMITTED'; END IF;
    END $guard$;`)
    sections.push(stage.body)
    // New tables must not commit without policies. Preserve other table policies.
    if (index === 2) {
      for (const table of ['risk_template_families', 'risk_assessment_versions'])
        sections.push(RLS_POLICY_SQL(table))
      sections.push(
        'GRANT SELECT, INSERT ON risk_assessment_versions TO beaconhs_app,beaconhs_super;',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON risk_template_families TO beaconhs_app,beaconhs_super;',
        'GRANT SELECT ON risk_assessment_versions,risk_template_families TO beaconhs_backup;',
        'REVOKE UPDATE, DELETE, TRUNCATE ON risk_assessment_versions FROM beaconhs_app,beaconhs_super;',
      )
    }
    sections.push(
      `INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ('${stage.hash}',${stage.createdAt});`,
      'COMMIT;',
      `\\echo ${stage.tag} committed`,
    )
  }
  sections.push(
    ledgerGuard([...baseline, ...stages]),
    "SELECT pg_advisory_unlock(hashtext('beaconhs:schema-migration'));",
    '-- Keep writers fenced. Verify RLS, immutable history, catalogue and application readiness separately.',
  )
  return sections.join('\n') + '\n'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] !== '--plan' || process.argv.length !== 4)
      throw new Error('Use --plan TARGET_DATABASE; offline only')
    process.stdout.write(preparedRiskPlan(process.argv[3]!))
  } catch {
    console.error('Risk plan rejected; no database accessed')
    process.exitCode = 1
  }
}

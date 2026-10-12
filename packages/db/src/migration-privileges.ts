import { sql } from 'drizzle-orm'
import type { MigrationDatabase } from './migration-connection'

function identifier(role: string) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error(`Invalid database role name: ${role}`)
  return `"${role}"`
}

/** New tables must not inherit broad access before the runner installs RLS.
 * Existing object ACLs are untouched. Explicit module GRANT/REVOKE remains final.
 */
export async function prepareMigrationPrivileges(
  db: MigrationDatabase,
  ownerRole: string,
  runtimeRole: string,
  maintenanceRole: string,
  backupRole: string,
) {
  const owner = identifier(ownerRole),
    runtime = identifier(runtimeRole),
    maintenance = identifier(maintenanceRole),
    backup = identifier(backupRole)
  await db.transaction(async (tx) => {
    for (const statement of [
      `REVOKE CREATE ON SCHEMA public FROM PUBLIC, ${runtime}, ${maintenance}, ${backup}`,
      `GRANT USAGE ON SCHEMA public TO ${runtime}, ${maintenance}, ${backup}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON TABLES FROM ${runtime}, ${maintenance}, ${backup}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${runtime}, ${maintenance}, ${backup}`,
    ])
      await tx.execute(sql.raw(statement))
  })
}

/** Only untouched ACLs receive the baseline, after existing RLS installation.
 * PostgreSQL records an explicit REVOKE on an untouched object as a non-null ACL;
 * column ACLs also mark an object as module-managed. Never infer access from an
 * absent role entry within an explicit ACL. This is intentionally fail-closed.
 */
export async function grantUnmanagedObjects(
  db: MigrationDatabase,
  ownerRole: string,
  runtimeRole: string,
  maintenanceRole: string,
  backupRole: string,
) {
  identifier(ownerRole)
  const runtime = identifier(runtimeRole),
    maintenance = identifier(maintenanceRole)
  await db.transaction(async (tx) => {
    const objects = await tx.execute(sql`SELECT c.relname,c.relkind FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relowner=${ownerRole}::regrole
        AND c.relkind IN ('r','p','v','m','S') AND c.relacl IS NULL
        AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attacl IS NOT NULL)`)
    for (const object of objects) {
      const name = sql.identifier(String(object.relname))
      if (object.relkind === 'S') {
        await tx.execute(
          sql`GRANT USAGE,SELECT,UPDATE ON SEQUENCE public.${name} TO ${sql.raw(runtime)},${sql.raw(maintenance)}`,
        )
      } else {
        await tx.execute(
          sql`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.${name} TO ${sql.raw(runtime)},${sql.raw(maintenance)}`,
        )
      }
    }
  })
  await grantBackupReadAccess(db, ownerRole, backupRole)
}

/** Canonical backup policy (scripts/cluster/provision.sql and backup.sh):
 * complete cross-tenant logical backups, SELECT only. Unlike application ACLs,
 * backup coverage is platform-wide, including explicitly managed module tables.
 * Never repair elevated backup permissions silently: reject drift before grants.
 */
export async function grantBackupReadAccess(
  db: MigrationDatabase,
  ownerRole: string,
  backupRole: string,
) {
  identifier(ownerRole)
  const backup = identifier(backupRole)
  await db.transaction(async (tx) => {
    const [role] = await tx.execute(sql`SELECT r.rolcanlogin AND NOT r.rolsuper
      AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole
      AND NOT r.rolreplication AND r.rolbypassrls
      AND coalesce(r.rolconfig @> ARRAY['default_transaction_read_only=on'],false)
      AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid)
      AND r.oid <> ${ownerRole}::regrole AS safe
      FROM pg_roles r WHERE r.rolname=${backupRole}`)
    if (!role?.safe) throw new Error('Backup role violates canonical read-only backup policy')
    const objects = await tx.execute(sql`SELECT c.relname,c.relkind,
      CASE WHEN c.relkind='S' THEN
        has_sequence_privilege(${backupRole},c.oid,'USAGE,UPDATE,SELECT WITH GRANT OPTION')
      ELSE has_table_privilege(${backupRole},c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,SELECT WITH GRANT OPTION')
        OR has_any_column_privilege(${backupRole},c.oid,'INSERT,UPDATE,REFERENCES,SELECT WITH GRANT OPTION') END AS elevated
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relowner=${ownerRole}::regrole
        AND c.relkind IN ('r','p','v','m','S')`)
    if (objects.some((object) => object.elevated))
      throw new Error('Backup ACL drift: write or grant-option privileges detected')
    for (const object of objects) {
      const kind = object.relkind === 'S' ? 'SEQUENCE' : 'TABLE'
      await tx.execute(
        sql`GRANT SELECT ON ${sql.raw(kind)} public.${sql.identifier(String(object.relname))} TO ${sql.raw(backup)}`,
      )
    }
  })
}

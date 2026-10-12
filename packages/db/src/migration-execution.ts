import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import type { MigrationDatabase } from './migration-connection'
import { validateMigrationState, type MigrationFile } from './migration-state'

type ExecutableMigration = MigrationFile & { body: string }
export function loadMigrationBodies(folder: string, files: MigrationFile[]): ExecutableMigration[] {
  return files.map((file) => {
    const body = readFileSync(resolve(folder, `${file.tag}.sql`), 'utf8')
    if (createHash('sha256').update(body).digest('hex') !== file.hash)
      throw new Error(`Migration changed after validation: ${file.tag}`)
    return { ...file, body }
  })
}

/** Caller holds the session migration lock on a pinned connection throughout.
 * Commit boundaries are per migration, never per statement. Retry is explicit.
 */
export async function executePendingMigrations(
  db: MigrationDatabase,
  migrations: ExecutableMigration[],
  options: { allowLegacyBefore?: number } = {},
) {
  if (!migrations.length) throw new Error('No migration files provided')
  let previous = -1
  const tags = new Set<string>()
  for (const migration of migrations) {
    if (
      tags.has(migration.tag) ||
      !Number.isSafeInteger(migration.createdAt) ||
      migration.createdAt <= previous ||
      createHash('sha256').update(migration.body).digest('hex') !== migration.hash
    )
      throw new Error(`Invalid migration source: ${migration.tag}`)
    tags.add(migration.tag)
    previous = migration.createdAt
  }
  // Do not manufacture history for an existing schema without a tracker.
  const [existing] = await db.execute(sql`SELECT to_regclass('public.tenants') AS app,
    to_regclass('drizzle.__drizzle_migrations') AS tracker`)
  if (existing?.app && !existing.tracker)
    throw new Error('Existing schema has no migration tracker')
  await db.transaction(async (tx) => {
    await tx.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`)
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations
      (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`)
  })
  const readState = async () => {
    const rows = await db.execute(
      sql`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id`,
    )
    const seen = new Set<string>()
    for (const row of rows) {
      const key = String(row.created_at)
      if (seen.has(key)) throw new Error(`Duplicate migration ledger timestamp: ${key}`)
      seen.add(key)
    }
    if (!rows.length) {
      if (existing?.app) throw new Error('Existing schema has no migration history')
      return migrations
    }
    const state = validateMigrationState(
      migrations,
      rows.map((row) => ({ hash: String(row.hash), createdAt: String(row.created_at) })),
      options,
    )
    const unknown = rows.filter(
      (row) =>
        !migrations.some((m) => m.createdAt === Number(row.created_at) && m.hash === row.hash),
    )
    if (
      unknown.some(
        (row) => !options.allowLegacyBefore || Number(row.created_at) >= options.allowLegacyBefore,
      )
    )
      throw new Error('Unknown migration ledger identity')
    return migrations.filter((migration) =>
      state.pending.some((pending) => pending.createdAt === migration.createdAt),
    )
  }
  const pending = await readState()
  for (const migration of pending) {
    await db.transaction(async (tx) => {
      for (const statement of migration.body.split('--> statement-breakpoint'))
        if (statement.trim()) await tx.execute(sql.raw(statement))
      await tx.execute(sql`INSERT INTO drizzle.__drizzle_migrations(hash,created_at)
        VALUES(${migration.hash},${migration.createdAt})`)
    })
  }
  if ((await readState()).length) throw new Error('Migration replay incomplete')
  return pending.map((m) => m.tag)
}

import { createHash } from 'node:crypto'
import { getTableColumns, getTableName, sql } from 'drizzle-orm'
import { executeParameterizedRows, type Database } from './client'
import { platformAuditLog } from './schema'
import { buildCycasDemoSeedPlan, CYCAS_DEMO_SEED_KEY, cycasId } from './cycas-demo-seed-plan'
import { buildCycasSeedBatches, type CycasSeedBatch } from './cycas-demo-seed-rows'

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, canonical(v)]),
    )
  return value
}
function digest(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
}
const ident = (name: string) => '"' + name.replaceAll('"', '""') + '"'
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

function groupBatches(batches: CycasSeedBatch[]) {
  const grouped = new Map<string, CycasSeedBatch>()
  for (const batch of batches) {
    const name = getTableName(batch.table)
    const existing = grouped.get(name)
    if (existing) existing.rows.push(...batch.rows)
    else grouped.set(name, { table: batch.table, rows: [...batch.rows] })
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
}

async function inventoryDigest(tx: Tx, groups: ReturnType<typeof groupBatches>) {
  const inventory: Record<string, unknown> = {}
  for (const [name, batch] of groups) {
    const rows = await executeParameterizedRows(
      tx,
      `SELECT to_jsonb(t) AS row FROM public.${ident(name)} t
       WHERE id::text = ANY(ARRAY(SELECT jsonb_array_elements_text($1::jsonb))) ORDER BY id::text`,
      [JSON.stringify(batch.rows.map((row) => String(row.id)))],
    )
    if (rows.length !== batch.rows.length)
      throw new Error(`Cycas seed incomplete or conflicting IDs: ${name}`)
    inventory[name] = rows.map((row) => row.row)
  }
  return digest(inventory)
}

/** Catalogue expressions are database-owned, never user-supplied SQL. This
 * checks every live unique index, including composite/expression/partial indexes,
 * against both the complete proposed batch and existing rows, before any INSERT.
 * Locks prevent application writers racing the preflight. */
async function preflight(tx: Tx, groups: ReturnType<typeof groupBatches>, replay: boolean) {
  for (const [name, batch] of groups) {
    const columns = getTableColumns(batch.table)
    const proposed = batch.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
          const column = columns[key]
          if (!column) throw new Error(`Unknown Cycas seed column: ${name}.${key}`)
          return [column.name, value]
        }),
      ),
    )
    const indexes = await executeParameterizedRows(
      tx,
      `
      SELECT ci.relname AS name, i.indnullsnotdistinct AS nulls_equal,
        coalesce(pg_get_expr(i.indpred, i.indrelid), 'true') AS predicate,
        ARRAY(SELECT pg_get_indexdef(i.indexrelid, n, true)
          FROM generate_series(1, i.indnkeyatts) n) AS expressions
      FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid
      WHERE i.indrelid=$1::regclass AND i.indisunique AND i.indisvalid
      ORDER BY ci.relname`,
      [`public.${ident(name)}`],
    )
    // Better Auth treats these as identity keys even where its schema has a
    // non-unique lookup index. Email comparison also protects case aliases.
    if (name === 'account')
      indexes.push({
        name: 'account_provider_identity',
        nulls_equal: false,
        predicate: 'true',
        expressions: ['"providerId"', '"accountId"'],
      })
    if (name === 'user')
      indexes.push({
        name: 'user_email_casefold',
        nulls_equal: false,
        predicate: 'true',
        expressions: ['lower(email)'],
      })
    for (const index of indexes) {
      const expressions = index.expressions as string[]
      const keys = expressions.map((_, i) => `k${i}`)
      const projection = expressions.map((expr, i) => `${expr} AS k${i}`).join(', ')
      const nonNull = index.nulls_equal
        ? 'true'
        : keys.map((key) => `${key} IS NOT NULL`).join(' AND ')
      const collisions = await executeParameterizedRows(
        tx,
        `
        WITH proposed AS (
          SELECT * FROM jsonb_populate_recordset(NULL::public.${ident(name)}, $1::jsonb)
        ), keys AS (
          SELECT ${projection}, true AS proposed FROM proposed WHERE ${index.predicate}
          UNION ALL
          SELECT ${projection}, false AS proposed FROM public.${ident(name)}
          WHERE (${index.predicate}) AND NOT (id::text = ANY(ARRAY(SELECT jsonb_array_elements_text($2::jsonb))))
        )
        SELECT 1 FROM keys WHERE ${nonNull}
        GROUP BY ${keys.join(', ')} HAVING count(*) > 1 AND bool_or(proposed) LIMIT 1
      `,
        [
          JSON.stringify(proposed),
          JSON.stringify(replay ? batch.rows.map((row) => String(row.id)) : []),
        ],
      )
      if (collisions.length)
        throw new Error(`Cycas collision before writes: ${name} / ${index.name}`)
    }
  }
}

export async function seedCycasDemo(
  db: Pick<Database, 'transaction'>,
  plan: ReturnType<typeof buildCycasDemoSeedPlan>,
  loadCredentialHashes: () => Promise<Record<string, string>>,
) {
  const batches = buildCycasSeedBatches(plan)
  const groups = groupBatches(batches)
  const planDigest = digest(groups.map(([name, batch]) => ({ name, rows: batch.rows })))
  const markerId = cycasId('board-manifest:2026-10-15')
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`)
    await tx.execute(sql`SET LOCAL statement_timeout = '60s'`)
    // Explicit cross-tenant bootstrap scope: dedicated super client, never an app request.
    await tx.execute(
      sql.raw(
        `LOCK TABLE ${[...groups.map(([name]) => name), 'platform_audit_log']
          .sort()
          .map((name) => `public.${ident(name)}`)
          .join(', ')} IN SHARE ROW EXCLUSIVE MODE`,
      ),
    )
    const markers = await executeParameterizedRows(
      tx,
      `SELECT * FROM platform_audit_log WHERE id=$1::uuid OR
        (entity_type='cycas_board_seed' AND entity_id=$2)`,
      [markerId, plan.tenantId],
    )
    const marker = markers[0]
    if (marker) {
      const metadata = marker.metadata as Record<string, unknown>
      if (
        markers.length !== 1 ||
        marker.id !== markerId ||
        marker.entity_type !== 'cycas_board_seed' ||
        marker.entity_id !== plan.tenantId ||
        metadata.demoSeedKey !== CYCAS_DEMO_SEED_KEY ||
        metadata.planDigest !== planDigest
      )
        throw new Error('Cycas manifest collision or changed seed plan; refusing all writes')
      if (metadata.inventoryDigest !== (await inventoryDigest(tx, groups)))
        throw new Error('Cycas seed records changed after seeding; refusing all writes')
      await preflight(tx, groups, true)
      return { state: 'unchanged' as const, counts: metadata.counts }
    }
    await preflight(tx, groups, false)
    const hashes = await loadCredentialHashes()
    const expectedEmails = plan.staff.map((member) => member.email).sort()
    if (
      JSON.stringify(Object.keys(hashes).sort()) !== JSON.stringify(expectedEmails) ||
      Object.values(hashes).some((hash) => !/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(hash))
    )
      throw new Error(
        'Credential file must contain exactly the planned Better Auth password hashes',
      )
    for (const batch of batches) {
      const name = getTableName(batch.table)
      const rows =
        name === 'account'
          ? batch.rows.map((row) => {
              const member = plan.staff.find((member) => member.userId === row.userId)!
              return { ...row, password: hashes[member.email] }
            })
          : batch.rows
      try {
        await tx.insert(batch.table).values(rows)
      } catch (error) {
        // Drizzle errors can contain bound password hashes: never emit query/parameters.
        const cause = (error as { cause?: { code?: string; constraint_name?: string } }).cause
        throw new Error(
          `Cycas insertion failed in ${name} (${cause?.code ?? 'unknown'}, ${cause?.constraint_name ?? 'unknown'}); transaction rolled back`,
        )
      }
    }
    const counts = Object.fromEntries(groups.map(([name, batch]) => [name, batch.rows.length]))
    const persistedDigest = await inventoryDigest(tx, groups)
    await tx.insert(platformAuditLog).values({
      id: markerId,
      actorUserId: plan.staff[0]!.userId,
      entityType: 'cycas_board_seed',
      entityId: plan.tenantId,
      action: 'create',
      summary: 'Insert-only Cycas Board demo dataset, 15 October 2026',
      metadata: {
        demoSeedKey: CYCAS_DEMO_SEED_KEY,
        planDigest,
        inventoryDigest: persistedDigest,
        counts,
      },
      occurredAt: plan.now,
    })
    return { state: 'inserted' as const, counts }
  })
}

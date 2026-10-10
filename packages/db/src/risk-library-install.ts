import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { Database } from './client'
import { riskTemplates, riskTemplateFamilies } from './schema'
import { RISK_CATALOGUE, RISK_CATALOGUE_TEMPLATES, riskCatalogueId } from './risk-catalogue'
import { SLIPS_TRIPS_TEMPLATE } from './risk-library'

type Template = typeof riskTemplates.$inferSelect
type CatalogueRow = (typeof RISK_CATALOGUE_TEMPLATES)[number]

export type CatalogueFailureOperation =
  'table_lock' | 'existing_rows' | 'conflict_preflight' | 'insert_row' | 'insert_verify'

/** Safe diagnostic only: never stores SQL text, values or driver message. */
export class RiskCatalogueInstallError extends Error {
  readonly operation: CatalogueFailureOperation
  readonly reference?: string
  readonly classification: string
  readonly sqlState?: string
  readonly constraint?: string

  constructor(input: {
    operation: CatalogueFailureOperation
    classification: string
    reference?: string
    sqlState?: string
    constraint?: string
  }) {
    super('Risk catalogue installation failed')
    this.name = 'RiskCatalogueInstallError'
    this.operation = input.operation
    this.classification = input.classification
    this.reference = input.reference
    this.sqlState = input.sqlState
    this.constraint = input.constraint
  }
}

function safeSqlIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z_][a-z0-9_]{0,62}$/.test(value) ? value : undefined
}

export function formatRiskCatalogueDiagnostic(error: RiskCatalogueInstallError): string {
  const reference =
    error.reference && /^RA-0(?:[0-4][0-9]|50)$/.test(error.reference) ? error.reference : 'unknown'
  return [
    'operation=' + error.operation,
    'classification=' + error.classification,
    'reference=' + reference,
    'sqlstate=' + (error.sqlState ?? 'none'),
    'constraint=' + (error.constraint ?? 'none'),
  ].join(' ')
}

function databaseFailure(error: unknown, operation: CatalogueFailureOperation, reference?: string) {
  const row = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const sqlState =
    typeof row.code === 'string' && /^[0-9A-Z]{5}$/.test(row.code) ? row.code : undefined
  const constraint = safeSqlIdentifier(row.constraint_name ?? row.constraint)
  const classification = sqlState?.startsWith('23')
    ? 'integrity_constraint_violation'
    : sqlState === '42501'
      ? 'permission_denied'
      : sqlState === '57014'
        ? 'statement_cancelled_or_timed_out'
        : 'database_operation_failed'
  return new RiskCatalogueInstallError({
    operation,
    classification,
    reference,
    sqlState,
    constraint,
  })
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

/** Fail before inserting anything if a stable ID or published version differs.
 * State/deletion changes are intentionally retained; installation never reactivates.
 */
export function planRiskCatalogueInstall(existing: Template[]): CatalogueRow[] {
  const missing: CatalogueRow[] = []
  for (const wanted of RISK_CATALOGUE_TEMPLATES) {
    const matches = existing.filter(
      (row) =>
        row.id === wanted.id ||
        (row.scope === 'platform' && row.title === wanted.title && row.version === wanted.version),
    )
    if (matches.length === 0) {
      missing.push(wanted)
      continue
    }
    if (
      matches.length !== 1 ||
      Object.entries(wanted).some(
        ([key, value]) =>
          key !== 'state' && canonical(matches[0]![key as keyof Template]) !== canonical(value),
      )
    )
      throw new RiskCatalogueInstallError({
        operation: 'conflict_preflight',
        classification: 'existing_platform_template_conflict',
        reference: RISK_CATALOGUE.find((item) => riskCatalogueId(item.reference) === wanted.id)
          ?.reference,
      })
  }
  return missing
}

async function installExistingStandardTemplate(db: Pick<Database, 'insert'>) {
  await db
    .insert(riskTemplateFamilies)
    .values({
      id: SLIPS_TRIPS_TEMPLATE.templateFamilyId,
      tenantId: null,
      ownerKey: SLIPS_TRIPS_TEMPLATE.ownerKey,
      scope: 'platform',
    })
    .onConflictDoNothing()
  return db.insert(riskTemplates).values(SLIPS_TRIPS_TEMPLATE).onConflictDoNothing()
}

// Requires prepared migrations 0060–0061 before execution; never invoke against
// the unchanged baseline database. Existing published rows remain untouched.
// The approved 50-topic catalogue requires an explicit, separately authorised call.
export function installStandardRiskLibrary(
  db: Pick<Database, 'insert'>,
): ReturnType<typeof installExistingStandardTemplate>
export function installStandardRiskLibrary(
  db: Pick<Database, 'transaction'>,
  options: { catalogue: 'uvanoo-v1.4' },
): Promise<{ inserted: number; retained: number }>
export function installStandardRiskLibrary(
  db: Pick<Database, 'insert'> | Pick<Database, 'transaction'>,
  options?: { catalogue: 'uvanoo-v1.4' },
) {
  if (options?.catalogue === 'uvanoo-v1.4') {
    if (!('transaction' in db))
      throw new Error('Catalogue installation requires an atomic transaction')
    return installApprovedCatalogue(db)
  }
  if (!('insert' in db)) throw new Error('Standard installation requires an insert connection')
  return installExistingStandardTemplate(db)
}

/** Importing this module performs no IO. Never called by a page or server action. */
async function installApprovedCatalogue(db: Pick<Database, 'transaction'>) {
  return db.transaction(async (tx) => {
    let operation: CatalogueFailureOperation = 'table_lock'
    let reference: string | undefined
    try {
      // Serialize concurrent installers and template writes for one atomic preflight.
      await tx.execute(sql`LOCK TABLE risk_templates IN SHARE ROW EXCLUSIVE MODE`)
      operation = 'existing_rows'
      const existing = await tx
        .select()
        .from(riskTemplates)
        .where(
          or(
            inArray(
              riskTemplates.id,
              RISK_CATALOGUE_TEMPLATES.map((row) => row.id),
            ),
            and(
              eq(riskTemplates.scope, 'platform'),
              inArray(
                riskTemplates.title,
                RISK_CATALOGUE_TEMPLATES.map((row) => row.title),
              ),
            ),
          ),
        )
      operation = 'conflict_preflight'
      const missing = planRiskCatalogueInstall(existing)
      if (missing.length === 0) return { inserted: 0, retained: RISK_CATALOGUE_TEMPLATES.length }
      let insertedCount = 0
      for (const row of missing) {
        reference = RISK_CATALOGUE.find(
          (item) => riskCatalogueId(item.reference) === row.id,
        )?.reference
        operation = 'insert_row'
        await tx
          .insert(riskTemplateFamilies)
          .values({
            id: row.templateFamilyId,
            tenantId: null,
            ownerKey: row.ownerKey,
            scope: 'platform',
          })
          .onConflictDoNothing()
        const inserted = await tx
          .insert(riskTemplates)
          .values(row)
          .onConflictDoNothing()
          .returning({ id: riskTemplates.id })
        if (inserted.length !== 1) {
          operation = 'insert_verify'
          throw new RiskCatalogueInstallError({
            operation,
            classification: 'concurrent_or_unique_key_conflict',
            reference,
          })
        }
        insertedCount += 1
      }
      return {
        inserted: insertedCount,
        retained: RISK_CATALOGUE_TEMPLATES.length - insertedCount,
      }
    } catch (error) {
      if (error instanceof RiskCatalogueInstallError) throw error
      throw databaseFailure(error, operation, reference)
    }
  })
}

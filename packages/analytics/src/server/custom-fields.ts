// Augment the discovered analytics catalog with tenant custom-field columns.
// The column SQL + typing is owned by @beaconhs/reports (loadCustomFieldColumns);
// here we only decorate those columns with the semantic flags the BHQL builder
// + studio need (canDimension/canMeasure/…). Custom-field values live in a jsonb
// `metadata` column, so each column carries a server-generated `expr` that the
// compiler resolves through `columnRef`.

import type { Database } from '@beaconhs/db'
import { PROPERTY_REPORTING_TABLES } from '@beaconhs/db/rls'
import type { ReportEntityColumn } from '@beaconhs/reports'
import { loadBeaconCustomReportColumns } from '@beaconhs/reports/server'
import { deriveSemanticType, type AnalyticsColumn, type AnalyticsEntity } from '../semantic'
import { discoverEntities, scopedFormAppEntity } from './discover'

function decorate(col: ReportEntityColumn): AnalyticsColumn {
  const semanticType = deriveSemanticType(col)
  const isNumber = col.kind === 'number'
  const isTemporal = col.kind === 'date' || col.kind === 'timestamp'
  return {
    ...col,
    semanticType,
    canDimension: true,
    canMeasure: isNumber,
    canBinTemporal: isTemporal,
    canBinNumeric: isNumber,
  }
}

/** Discovered entities with the tenant's active custom-field columns appended.
 *  Only the four custom-field-bearing base tables incur a DB read. */
async function discoverEntitiesWithCustomFields(tx: Database): Promise<AnalyticsEntity[]> {
  const base = discoverEntities()
  const out: AnalyticsEntity[] = []
  for (const entity of base) {
    const cols = await loadBeaconCustomReportColumns(tx, entity.table)
    if (!cols.length) {
      out.push(entity)
      continue
    }
    const existing = new Set(entity.columns.map((c) => c.key))
    const add = cols.filter((c) => !existing.has(c.key)).map(decorate)
    out.push(add.length ? { ...entity, columns: [...entity.columns, ...add] } : entity)
  }
  return out
}

/** Map form of {@link discoverEntitiesWithCustomFields}. */
export async function discoverEntityMapWithCustomFields(
  tx: Database,
): Promise<Record<string, AnalyticsEntity>> {
  const entities = await discoverEntitiesWithCustomFields(tx)
  return Object.fromEntries(entities.map((e) => [e.key, e]))
}

/** Add only Builder apps already authorized by the caller. This function never
 *  discovers templates itself: tenant RLS is not an app audience/lifecycle
 *  policy, so authorization must happen before IDs reach this boundary. */
export async function discoverEntitiesWithScopedApps(
  tx: Database,
  apps: readonly { id: string; name: string }[],
  options: { propertyScopeMode?: 'tenant' | 'property' | 'legacy' } = {},
): Promise<AnalyticsEntity[]> {
  const discovered = await discoverEntitiesWithCustomFields(tx)
  const propertyRestricted =
    options.propertyScopeMode !== undefined && options.propertyScopeMode !== 'tenant'
  const certifiedBase = propertyRestricted ? propertyCertifiedEntities(discovered) : discovered
  const appEntities =
    !propertyRestricted || PROPERTY_REPORTING_TABLES.has('form_responses')
      ? apps
          .map((a) => scopedFormAppEntity(a.id, a.name))
          .filter((e): e is AnalyticsEntity => e != null)
      : []
  return [...certifiedBase, ...appEntities]
}

/** Fail closed to tables with audited property provenance and remove joins that
 * could escape that certified inventory. */
export function propertyCertifiedEntities(entities: readonly AnalyticsEntity[]): AnalyticsEntity[] {
  const base = entities.filter((entity) => PROPERTY_REPORTING_TABLES.has(entity.table))
  const allowedKeys = new Set(base.map((entity) => entity.key))
  return base.map((entity) => ({
    ...entity,
    relations: entity.relations?.filter((relation) => allowedKeys.has(relation.target)),
  }))
}

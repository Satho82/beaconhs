import type { ReportRunRequestSnapshot } from '@beaconhs/db/schema'
import {
  normalizeReportRuntimeFilters,
  validateBeaconReportRuntimeFilters,
} from '@beaconhs/reports/server'
import 'server-only'

import type { Database } from '@beaconhs/db'
import { loadBeaconReportCatalog } from '@beaconhs/reports/server'
import type { RequestContext } from '@beaconhs/tenant'
import { resolveAnalyticsAccess } from './analytics-access'

/**
 * Reports and Insights share one authorization-aware source inventory.
 * AppKit receives only the already-authorized Beacon catalogue.
 */
export async function loadAuthorizedReportCatalogInTransaction(
  ctx: RequestContext,
  tx: Database,
  options: { activePropertyId?: string | null } = {},
) {
  const access = await resolveAnalyticsAccess(ctx, tx, options)
  return loadBeaconReportCatalog(tx, access.entities)
}

export async function loadAuthorizedReportCatalog(ctx: RequestContext) {
  return ctx.db((tx) => loadAuthorizedReportCatalogInTransaction(ctx, tx))
}

/** Re-authorize historical artifacts against current module, role and source access. */
export async function assertReportSnapshotAccessible(
  ctx: RequestContext,
  snapshot: ReportRunRequestSnapshot,
) {
  const catalog = await loadAuthorizedReportCatalog(ctx)
  validateBeaconReportRuntimeFilters(
    ctx.tenantId,
    snapshot.definition.query,
    catalog,
    normalizeReportRuntimeFilters(snapshot.filters),
  )
}

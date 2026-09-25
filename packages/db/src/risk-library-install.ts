import type { drizzle } from 'drizzle-orm/postgres-js'
import { riskTemplates } from './schema'
import { SLIPS_TRIPS_TEMPLATE } from './risk-library'

/** Install the shipped platform catalogue without reseeding tenant data or
 * overwriting an existing template/version, including an intentionally retired one.
 */
export function installStandardRiskLibrary(db: ReturnType<typeof drizzle>) {
  return db.insert(riskTemplates).values(SLIPS_TRIPS_TEMPLATE).onConflictDoNothing()
}

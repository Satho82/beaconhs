import { TENANT_SCOPED_TABLES } from './rls'

const PROPOSED_TABLES = new Set(['risk_template_families', 'risk_assessment_versions'])

/** A 0058/0059 database retains its existing RLS but never gets new-table SQL. */
export function riskMigrationTasks(state: { families: boolean; versions: boolean } | undefined) {
  if (!state || state.families !== state.versions) {
    throw new Error('Incomplete Risk schema: refusing partial RLS installation')
  }
  return {
    tables: TENANT_SCOPED_TABLES.filter((table) => state.families || !PROPOSED_TABLES.has(table)),
    installRiskLibrary: state.families && state.versions,
  }
}

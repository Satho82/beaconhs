import { sql } from 'drizzle-orm'
import { hospitalityProperties, incidents, people, tenantUsers } from '@beaconhs/db/schema'

// Keep the correlated outer reference explicit: Drizzle's single-table SELECT
// projection removes table qualifiers from interpolated Column objects. An
// unqualified "id" here resolves to the inner table and silently returns zero.
// The fixed identifier is not user input. Authorization remains at the caller.
export const platformTenantCounts = {
  memberCount: sql<number>`(select count(*) from ${tenantUsers} where ${tenantUsers.tenantId} = "tenants"."id")`,
  peopleCount: sql<number>`(select count(*) from ${people} where ${people.tenantId} = "tenants"."id")`,
  incidentCount: sql<number>`(select count(*) from ${incidents} where ${incidents.tenantId} = "tenants"."id")`,
  propertyCount: sql<number>`(select count(*) from ${hospitalityProperties} where ${hospitalityProperties.tenantId} = "tenants"."id" and ${hospitalityProperties.deletedAt} is null)`,
}

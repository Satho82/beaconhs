import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'
import {
  crews,
  departments,
  hospitalityProperties,
  people,
  personTitles,
  trades,
} from '@beaconhs/db/schema'
import type { RequestContext } from '@beaconhs/tenant'
import { hospitalityPropertyWhere } from '@/lib/hospitality/property-access'
import { assertCanManageModule } from '@/lib/module-admin/guard'
import type { PeopleImportReferences } from './people'

function normalizedReference(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
}

function nameSet(rows: readonly { name: string }[]): ReadonlySet<string> {
  return new Set(rows.map((row) => normalizedReference(row.name)))
}

/** Resolves only tenant-local, currently authorised import references. */
export async function resolvePeopleImportReferences(
  ctx: RequestContext,
): Promise<PeopleImportReferences> {
  assertCanManageModule(ctx, 'people')
  return ctx.db(async (tx) => {
    const propertyScope = hospitalityPropertyWhere(ctx, hospitalityProperties.id)
    const [departmentRows, tradeRows, crewRows, titleRows, propertyRows, personRows] =
      await Promise.all([
        tx
          .select({ name: departments.name })
          .from(departments)
          .where(eq(departments.tenantId, ctx.tenantId)),
        tx.select({ name: trades.name }).from(trades).where(eq(trades.tenantId, ctx.tenantId)),
        tx.select({ name: crews.name }).from(crews).where(eq(crews.tenantId, ctx.tenantId)),
        tx
          .select({ name: personTitles.name })
          .from(personTitles)
          .where(and(eq(personTitles.tenantId, ctx.tenantId), isNull(personTitles.deletedAt))),
        tx
          .select({ code: hospitalityProperties.code })
          .from(hospitalityProperties)
          .where(
            and(
              eq(hospitalityProperties.tenantId, ctx.tenantId),
              isNull(hospitalityProperties.deletedAt),
              propertyScope,
            ),
          ),
        tx
          .select({ id: people.id, employeeNo: people.employeeNo, email: people.email })
          .from(people)
          .where(and(eq(people.tenantId, ctx.tenantId), isNull(people.deletedAt))),
      ])

    const existingEmployeeNos = new Map<string, string>()
    const existingEmails = new Map<string, string>()
    for (const person of personRows) {
      if (person.employeeNo)
        existingEmployeeNos.set(normalizedReference(person.employeeNo), person.id)
      if (person.email) existingEmails.set(normalizedReference(person.email), person.id)
    }
    return {
      departments: nameSet(departmentRows),
      trades: nameSet(tradeRows),
      crews: nameSet(crewRows),
      jobTitles: nameSet(titleRows),
      properties: new Set(propertyRows.map((row) => normalizedReference(row.code))),
      existingEmployeeNos,
      existingEmails,
    }
  })
}

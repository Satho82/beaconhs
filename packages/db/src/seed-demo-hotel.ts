import { and, eq, inArray } from 'drizzle-orm'
import { config } from 'dotenv'
import { createSuperClient } from './client'
import {
  complianceObligations,
  complianceStatus,
  correctiveActions,
  equipmentCategories,
  equipmentItems,
  equipmentTypes,
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
  incidents,
  inspectionRecordCriteria,
  inspectionRecords,
  inspectionTypeCriteria,
  inspectionTypeGroups,
  inspectionTypes,
  maintenanceIssues,
  maintenanceWorkOrders,
  managerSignoffs,
  operationalTaskLifecycleEvents,
  operationalTaskOccurrences,
  operationalTaskSchedules,
  operationalTaskTemplates,
  orgUnits,
  people,
  peopleAssignments,
  qrTargets,
  roleAssignments,
  roles,
  tenantModuleEntitlements,
  tenants,
  tenantUsers,
  users,
  documents,
  documentVersions,
} from './schema'
import {
  assertDemoHotelSeedEnvironment,
  buildDemoHotelSeedPlan,
  DEMO_HOTEL_SEED_KEY,
  DEMO_HOTEL_TENANT_SLUG,
  demoId,
} from './demo-hotel-seed-plan'

config({ path: new URL('../../../.env', import.meta.url), quiet: true })

const anchorText = process.env.UVANOO_DEMO_SEED_ANCHOR
const anchor = anchorText ? new Date(anchorText) : new Date()
if (Number.isNaN(anchor.getTime()))
  throw new Error('UVANOO_DEMO_SEED_ANCHOR must be a valid ISO date')
assertDemoHotelSeedEnvironment(process.env)
const plan = buildDemoHotelSeedPlan(anchor)

if (process.env.UVANOO_DEMO_SEED_DRY_RUN === '1') {
  console.log(
    JSON.stringify(
      {
        target: process.env.UVANOO_DEMO_SEED_TARGET,
        anchor: anchor.toISOString(),
        expected: plan.expected,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

const { db, sql: pg } = createSuperClient()
async function verifyOwnership() {
  const [existingTenant] = await db
    .select({ id: tenants.id, settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.slug, DEMO_HOTEL_TENANT_SLUG))
    .limit(1)
  if (existingTenant) {
    if (
      existingTenant.id !== plan.tenantId ||
      existingTenant.settings.demoSeedKey !== DEMO_HOTEL_SEED_KEY
    ) {
      throw new Error(
        `Refusing to seed: tenant slug ${DEMO_HOTEL_TENANT_SLUG} is not owned by ${DEMO_HOTEL_SEED_KEY}`,
      )
    }
  }
  const expectedUsers = new Map(plan.staff.map((member) => [member.email, member.userId]))
  const collisions = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, [...expectedUsers.keys()]))
  for (const collision of collisions) {
    if (collision.id !== expectedUsers.get(collision.email)) {
      throw new Error(`Refusing to seed: demo email ${collision.email} belongs to another user`)
    }
  }
}

async function seed() {
  await verifyOwnership()
  await db.transaction(async (tx) => {
    await tx
      .insert(tenants)
      .values({
        id: plan.tenantId,
        slug: DEMO_HOTEL_TENANT_SLUG,
        name: 'Uvanoo Demo Hospitality',
        status: 'active',
        region: 'eu-west-2',
        defaultLanguage: 'en',
        enabledLanguages: ['en'],
        hierarchy: { customer: true, project: false, site: true, area: false },
        branding: { primaryColor: '#122b49' },
        settings: {
          demoSeedKey: DEMO_HOTEL_SEED_KEY,
          demoDataset: true,
          hotelPropertyId: plan.propertyId,
        },
      })
      .onConflictDoNothing()

    await tx
      .insert(users)
      .values(
        plan.staff.map((member) => ({
          id: member.userId,
          email: member.email,
          emailVerified: true,
          name: `${member.firstName} ${member.lastName}`,
          isSuperAdmin: false,
          timezone: 'Europe/London',
        })),
      )
      .onConflictDoNothing()

    await tx
      .insert(tenantUsers)
      .values(
        plan.staff.map((member) => ({
          id: member.tenantUserId,
          tenantId: plan.tenantId,
          userId: member.userId,
          displayName: `${member.firstName} ${member.lastName}`,
          status: 'active' as const,
          joinedAt: plan.now,
        })),
      )
      .onConflictDoNothing()

    await tx
      .insert(roles)
      .values(
        plan.roles.map((role) => ({
          id: demoId(`role:${role.key}`),
          tenantId: plan.tenantId,
          key: role.key,
          name: role.name,
          description: `Hotel demo role: ${role.name}.`,
          isBuiltIn: false,
          permissions: role.permissions,
        })),
      )
      .onConflictDoNothing()

    await tx
      .insert(roleAssignments)
      .values(
        plan.staff.map((member, index) => ({
          id: demoId(`role-assignment:${member.key}`),
          tenantId: plan.tenantId,
          tenantUserId: member.tenantUserId,
          roleId: demoId(`role:${plan.roles[index]!.key}`),
          scope: { type: 'tenant' as const },
        })),
      )
      .onConflictDoNothing()
    await tx
      .insert(orgUnits)
      .values([
        {
          id: plan.customerOrgUnitId,
          tenantId: plan.tenantId,
          parentId: null,
          level: 'customer',
          name: 'Uvanoo Demo Hospitality',
          code: 'UDH',
          address: { line1: '1 Uvanoo Square', city: 'London', postal: 'SW1A 1AA', country: 'GB' },
          metadata: { demoSeedKey: DEMO_HOTEL_SEED_KEY },
        },
        {
          id: plan.siteOrgUnitId,
          tenantId: plan.tenantId,
          parentId: plan.customerOrgUnitId,
          level: 'site',
          name: 'Uvanoo Demo Hotel',
          code: 'UDH-HOTEL',
          lat: 51.5014,
          lng: -0.1419,
          geofenceMeters: 150,
          address: { line1: '1 Uvanoo Square', city: 'London', postal: 'SW1A 1AA', country: 'GB' },
          metadata: { hospitalityPropertyId: plan.propertyId, demoSeedKey: DEMO_HOTEL_SEED_KEY },
        },
      ])
      .onConflictDoNothing()

    await tx
      .insert(people)
      .values([
        ...plan.staff.map((member, index) => ({
          id: member.personId,
          tenantId: plan.tenantId,
          userId: member.userId,
          employeeNo: `HOT-${String(index + 1).padStart(3, '0')}`,
          firstName: member.firstName,
          lastName: member.lastName,
          formalName: member.title,
          email: member.email,
          status: 'active' as const,
          notes: 'Uvanoo Demo Hotel staff member.',
          metadata: {
            jobTitle: member.title,
            employmentType: 'employee',
            demoSeedKey: DEMO_HOTEL_SEED_KEY,
          },
        })),
        ...plan.contractors.map((contractor, index) => ({
          id: contractor.personId,
          tenantId: plan.tenantId,
          userId: null,
          employeeNo: `CTR-${String(index + 1).padStart(3, '0')}`,
          firstName: contractor.firstName,
          lastName: contractor.lastName,
          formalName: `${contractor.company} contractor`,
          email: contractor.email,
          status: 'active' as const,
          notes: `Approved specialist contractor: ${contractor.company}.`,
          metadata: {
            employmentType: 'contractor',
            company: contractor.company,
            demoSeedKey: DEMO_HOTEL_SEED_KEY,
          },
        })),
      ])
      .onConflictDoNothing()

    await tx
      .insert(peopleAssignments)
      .values(
        [...plan.staff, ...plan.contractors].map((person) => ({
          id: demoId(`people-assignment:${person.key}`),
          tenantId: plan.tenantId,
          personId: person.personId,
          orgUnitId: plan.siteOrgUnitId,
          validFrom: plan.now.toISOString().slice(0, 10),
        })),
      )
      .onConflictDoNothing()
    await tx
      .insert(hospitalityProperties)
      .values({
        id: plan.propertyId,
        tenantId: plan.tenantId,
        name: 'Uvanoo Demo Hotel',
        code: 'UDH',
        timezone: 'Europe/London',
        address: {
          line1: '1 Uvanoo Square',
          city: 'London',
          postalCode: 'SW1A 1AA',
          country: 'GB',
        },
        metadata: { orgUnitId: plan.siteOrgUnitId, demoSeedKey: DEMO_HOTEL_SEED_KEY },
      })
      .onConflictDoNothing()
    await tx
      .insert(hospitalityBuildings)
      .values({
        id: plan.buildingId,
        tenantId: plan.tenantId,
        propertyId: plan.propertyId,
        name: 'Main House',
        code: 'MAIN',
        metadata: { demoSeedKey: DEMO_HOTEL_SEED_KEY },
      })
      .onConflictDoNothing()
    await tx.insert(hospitalityFloors).values(plan.floors).onConflictDoNothing()
    await tx.insert(hospitalityRooms).values(plan.rooms).onConflictDoNothing()
    await tx.insert(qrTargets).values(plan.qrTargets).onConflictDoNothing()

    const moduleKeys = [
      'hospitality.properties',
      'hospitality.maintenance',
      'hospitality.compliance',
      'hospitality.diary',
      'hospitality.manager-signoff',
    ]
    await tx
      .insert(tenantModuleEntitlements)
      .values(
        moduleKeys.map((moduleKey) => ({
          id: demoId(`entitlement:${moduleKey}`),
          tenantId: plan.tenantId,
          moduleKey,
          state: 'enabled' as const,
          effectiveFrom: plan.now,
          changedByUserId: plan.staff[0]!.userId,
        })),
      )
      .onConflictDoNothing()

    await tx
      .insert(equipmentCategories)
      .values({
        id: demoId('equipment-category'),
        tenantId: plan.tenantId,
        name: 'Hotel Plant',
        slug: 'hotel-plant',
        description: 'Core hotel engineering and life-safety assets.',
        sortOrder: 1,
        enabledFieldGroups: ['manufacture', 'specifications', 'ownership'],
      })
      .onConflictDoNothing()
    await tx
      .insert(equipmentTypes)
      .values({
        id: demoId('equipment-type'),
        tenantId: plan.tenantId,
        name: 'Hotel Engineering Asset',
        categoryId: demoId('equipment-category'),
        description: 'Fixed hotel plant and life-safety equipment.',
      })
      .onConflictDoNothing()
    await tx
      .insert(equipmentItems)
      .values(
        plan.equipment.map((item) => ({
          ...item,
          metadata: { propertyId: plan.propertyId, demoSeedKey: DEMO_HOTEL_SEED_KEY },
        })),
      )
      .onConflictDoNothing()

    await tx.insert(maintenanceIssues).values(plan.maintenanceIssues).onConflictDoNothing()
    await tx.insert(maintenanceWorkOrders).values(plan.workOrders).onConflictDoNothing()
    await tx.insert(operationalTaskTemplates).values(plan.taskTemplates).onConflictDoNothing()
    await tx.insert(operationalTaskSchedules).values(plan.taskSchedules).onConflictDoNothing()
    await tx.insert(operationalTaskOccurrences).values(plan.occurrences).onConflictDoNothing()
    await tx
      .insert(operationalTaskLifecycleEvents)
      .values(plan.lifecycleEvents)
      .onConflictDoNothing()
    await tx.insert(managerSignoffs).values(plan.signoffs).onConflictDoNothing()

    await tx.insert(inspectionTypes).values(plan.inspectionTypes).onConflictDoNothing()
    await tx.insert(inspectionTypeGroups).values(plan.inspectionGroups).onConflictDoNothing()
    await tx.insert(inspectionTypeCriteria).values(plan.inspectionCriteria).onConflictDoNothing()
    await tx.insert(inspectionRecords).values(plan.inspectionRecords).onConflictDoNothing()
    await tx.insert(correctiveActions).values(plan.correctiveActions).onConflictDoNothing()
    await tx.insert(inspectionRecordCriteria).values(plan.recordCriteria).onConflictDoNothing()

    await tx.insert(documents).values(plan.documents).onConflictDoNothing()
    await tx.insert(documentVersions).values(plan.documentVersions).onConflictDoNothing()
    await tx.insert(complianceObligations).values(plan.complianceObligations).onConflictDoNothing()
    await tx.insert(complianceStatus).values(plan.complianceStatuses).onConflictDoNothing()
    await tx.insert(incidents).values(plan.incidents).onConflictDoNothing()

    // Refresh only seed-owned time-sensitive rows so dashboard windows remain deterministic.
    for (const row of plan.occurrences) {
      await tx
        .update(operationalTaskOccurrences)
        .set({
          occurrenceAt: row.occurrenceAt,
          dueAt: row.dueAt,
          status: row.status,
          completedAt: row.completedAt,
          completedByTenantUserId: row.completedByTenantUserId,
          completionNotes: row.completionNotes,
          updatedAt: plan.now,
        })
        .where(
          and(
            eq(operationalTaskOccurrences.tenantId, plan.tenantId),
            eq(operationalTaskOccurrences.id, row.id),
          ),
        )
    }
    for (const row of plan.inspectionRecords) {
      await tx
        .update(inspectionRecords)
        .set({
          occurredAt: row.occurredAt,
          status: row.status,
          locked: row.locked,
          submittedAt: row.submittedAt,
          submittedByTenantUserId: row.submittedByTenantUserId,
          closedAt: row.closedAt,
          closedByTenantUserId: row.closedByTenantUserId,
          updatedAt: plan.now,
        })
        .where(and(eq(inspectionRecords.tenantId, plan.tenantId), eq(inspectionRecords.id, row.id)))
    }
    for (const row of plan.correctiveActions) {
      await tx
        .update(correctiveActions)
        .set({
          status: row.status,
          assignedOn: row.assignedOn,
          dueOn: row.dueOn,
          verifiedAt: row.verifiedAt,
          verifiedByTenantUserId: row.verifiedByTenantUserId,
          closedAt: row.closedAt,
          locked: row.locked,
          updatedAt: plan.now,
        })
        .where(and(eq(correctiveActions.tenantId, plan.tenantId), eq(correctiveActions.id, row.id)))
    }
    for (const row of plan.complianceStatuses) {
      await tx
        .update(complianceStatus)
        .set({
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          dueOn: row.dueOn,
          status: row.status,
          completedOn: row.completedOn,
          count: row.count,
          expected: row.expected,
          percent: row.percent,
          computedAt: row.computedAt,
          updatedAt: plan.now,
        })
        .where(and(eq(complianceStatus.tenantId, plan.tenantId), eq(complianceStatus.id, row.id)))
    }
    for (const row of plan.incidents) {
      await tx
        .update(incidents)
        .set({
          status: row.status,
          occurredAt: row.occurredAt,
          reportedAt: row.reportedAt,
          inProgress: row.inProgress,
          locked: row.locked,
          closedAt: row.closedAt,
          closedByTenantUserId: row.closedByTenantUserId,
          updatedAt: plan.now,
        })
        .where(and(eq(incidents.tenantId, plan.tenantId), eq(incidents.id, row.id)))
    }
    for (const row of plan.signoffs) {
      await tx
        .update(managerSignoffs)
        .set({
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          summary: row.summary,
          comments: row.comments,
          confirmedAt: row.confirmedAt,
          updatedAt: plan.now,
        })
        .where(and(eq(managerSignoffs.tenantId, plan.tenantId), eq(managerSignoffs.id, row.id)))
    }
  })
}

try {
  await seed()
  console.log('Uvanoo Demo Hotel seed completed.')
  console.log(JSON.stringify(plan.expected, null, 2))
} finally {
  await pg.end()
}

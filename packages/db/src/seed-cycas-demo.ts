import { config } from 'dotenv'
import { eq, inArray } from 'drizzle-orm'
import { createSuperClient } from './client'
import {
  complianceObligations,
  complianceStatus,
  correctiveActions,
  documentVersions,
  documents,
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
} from './schema'
import {
  assertCycasSeedEnvironment,
  buildCycasDemoSeedPlan,
  CYCAS_DEMO_SEED_KEY,
  CYCAS_DEMO_TENANT_SLUG,
  cycasId,
} from './cycas-demo-seed-plan'

config({ path: new URL('../../../.env', import.meta.url), quiet: true })
const anchorText = process.env.UVANOO_CYCAS_SEED_ANCHOR
const anchor = anchorText ? new Date(anchorText) : new Date()
if (Number.isNaN(anchor.getTime()))
  throw new Error('UVANOO_CYCAS_SEED_ANCHOR must be a valid ISO date')
assertCycasSeedEnvironment(process.env)
const plan = buildCycasDemoSeedPlan(anchor)
if (process.env.UVANOO_CYCAS_SEED_DRY_RUN === '1') {
  console.log(
    JSON.stringify(
      {
        target: process.env.UVANOO_CYCAS_SEED_TARGET,
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
const hotels = [plan.hotels.fenchurch, plan.hotels.lincoln]
const supportingStaff = hotels.flatMap((hotel) => hotel.staff)
const allAccounts = [
  ...plan.staff,
  ...supportingStaff.map((member) => ({
    ...member,
    propertyIds: [] as string[],
    roleKey: 'restricted',
  })),
]
const uniqueAccounts = [...new Map(allAccounts.map((member) => [member.userId, member])).values()]

async function verifyOwnership() {
  const [existing] = await db
    .select({ id: tenants.id, settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.slug, CYCAS_DEMO_TENANT_SLUG))
    .limit(1)
  if (
    existing &&
    (existing.id !== plan.tenantId || existing.settings.demoSeedKey !== CYCAS_DEMO_SEED_KEY)
  )
    throw new Error(`Refusing to seed: tenant slug ${CYCAS_DEMO_TENANT_SLUG} is not seed-owned`)
  const expectedUsers = new Map(uniqueAccounts.map((member) => [member.email, member.userId]))
  const collisions = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, [...expectedUsers.keys()]))
  for (const collision of collisions)
    if (collision.id !== expectedUsers.get(collision.email))
      throw new Error(`Refusing to seed: demo email ${collision.email} belongs to another user`)
}

async function seed() {
  await verifyOwnership()
  await db.transaction(async (tx) => {
    await tx
      .insert(tenants)
      .values({
        id: plan.tenantId,
        slug: CYCAS_DEMO_TENANT_SLUG,
        name: 'Cycas Hospitality',
        status: 'active',
        region: 'eu-west-2',
        defaultLanguage: 'en',
        enabledLanguages: ['en'],
        hierarchy: { customer: true, project: false, site: true, area: false },
        branding: { primaryColor: '#122b49' },
        settings: {
          demoSeedKey: CYCAS_DEMO_SEED_KEY,
          demoDataset: true,
          organisationType: 'hotel_management_company',
        },
      })
      .onConflictDoNothing()
    await tx
      .insert(users)
      .values(
        uniqueAccounts.map((member) => ({
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
        uniqueAccounts.map((member) => ({
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
          ...role,
          tenantId: plan.tenantId,
          description: `Cycas demo role: ${role.name}.`,
          isBuiltIn: false,
        })),
      )
      .onConflictDoNothing()
    await tx.insert(roleAssignments).values(plan.roleAssignments).onConflictDoNothing()

    const customerOrgUnitId = cycasId('org:customer')
    await tx
      .insert(orgUnits)
      .values([
        {
          id: customerOrgUnitId,
          tenantId: plan.tenantId,
          parentId: null,
          level: 'customer',
          name: 'Cycas Hospitality',
          code: 'CYCAS',
          address: { city: 'London', country: 'GB' },
          metadata: {
            demoSeedKey: CYCAS_DEMO_SEED_KEY,
            organisationType: 'hotel_management_company',
          },
        },
        ...plan.properties.map((property) => ({
          id: property.siteOrgUnitId,
          tenantId: plan.tenantId,
          parentId: customerOrgUnitId,
          level: 'site' as const,
          name: property.name,
          code: property.code,
          address: property.address,
          metadata: { hospitalityPropertyId: property.id, demoSeedKey: CYCAS_DEMO_SEED_KEY },
        })),
      ])
      .onConflictDoNothing()
    await tx
      .insert(people)
      .values(
        uniqueAccounts.map((member, index) => ({
          id: member.personId,
          tenantId: plan.tenantId,
          userId: member.userId,
          employeeNo: `CYC-${String(index + 1).padStart(3, '0')}`,
          firstName: member.firstName,
          lastName: member.lastName,
          formalName: member.title,
          email: member.email,
          status: 'active' as const,
          notes: 'Fictional Cycas Hospitality demonstration identity.',
          metadata: {
            jobTitle: member.title,
            employmentType: 'employee',
            demoSeedKey: CYCAS_DEMO_SEED_KEY,
          },
        })),
      )
      .onConflictDoNothing()
    await tx
      .insert(peopleAssignments)
      .values(
        plan.staff.flatMap((member) =>
          member.propertyIds.map((propertyId) => {
            const property = plan.properties.find((candidate) => candidate.id === propertyId)!
            return {
              id: cycasId(`people-assignment:${member.key}:${property.code}`),
              tenantId: plan.tenantId,
              personId: member.personId,
              orgUnitId: property.siteOrgUnitId,
              validFrom: plan.now.toISOString().slice(0, 10),
            }
          }),
        ),
      )
      .onConflictDoNothing()

    await tx
      .insert(hospitalityProperties)
      .values(
        plan.properties.map((property) => ({
          id: property.id,
          tenantId: plan.tenantId,
          name: property.name,
          code: property.code,
          timezone: property.timezone,
          address: property.address,
          metadata: { orgUnitId: property.siteOrgUnitId, demoSeedKey: CYCAS_DEMO_SEED_KEY },
        })),
      )
      .onConflictDoNothing()
    await tx
      .insert(hospitalityBuildings)
      .values(
        hotels.map((hotel, index) => ({
          id: hotel.buildingId,
          tenantId: plan.tenantId,
          propertyId: hotel.propertyId,
          name: index === 0 ? 'Fenchurch House' : 'Kingsway House',
          code: 'MAIN',
          metadata: { demoSeedKey: CYCAS_DEMO_SEED_KEY },
        })),
      )
      .onConflictDoNothing()
    await tx
      .insert(hospitalityFloors)
      .values(hotels.flatMap((hotel) => hotel.floors))
      .onConflictDoNothing()
    await tx
      .insert(hospitalityRooms)
      .values(hotels.flatMap((hotel) => hotel.rooms))
      .onConflictDoNothing()
    await tx
      .insert(qrTargets)
      .values(hotels.flatMap((hotel) => hotel.qrTargets))
      .onConflictDoNothing()

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
          id: cycasId(`entitlement:${moduleKey}`),
          tenantId: plan.tenantId,
          moduleKey,
          state: 'enabled' as const,
          effectiveFrom: plan.now,
          changedByUserId: plan.staff[0]!.userId,
        })),
      )
      .onConflictDoNothing()

    for (const [index, hotel] of hotels.entries()) {
      const prefix = index === 0 ? 'fenchurch' : 'lincoln'
      await tx
        .insert(equipmentCategories)
        .values({
          id: cycasId(`equipment-category:${prefix}`),
          tenantId: plan.tenantId,
          name: `${plan.properties[index]!.name} Plant`,
          slug: `${prefix}-plant`,
          description: 'Hotel engineering and life-safety assets.',
          sortOrder: index + 1,
          enabledFieldGroups: ['manufacture', 'specifications', 'ownership'],
        })
        .onConflictDoNothing()
      await tx
        .insert(equipmentTypes)
        .values({
          id: cycasId(`equipment-type:${prefix}`),
          tenantId: plan.tenantId,
          name: `${plan.properties[index]!.name} Engineering Asset`,
          categoryId: cycasId(`equipment-category:${prefix}`),
          description: 'Fixed hotel plant.',
        })
        .onConflictDoNothing()
      await tx
        .insert(equipmentItems)
        .values(
          hotel.equipment.map((item) => ({
            ...item,
            typeId: cycasId(`equipment-type:${prefix}`),
            metadata: { propertyId: hotel.propertyId, demoSeedKey: CYCAS_DEMO_SEED_KEY },
          })),
        )
        .onConflictDoNothing()
    }

    const combine = <K extends keyof (typeof hotels)[number]>(key: K) =>
      hotels.flatMap((hotel) => hotel[key] as unknown as readonly Record<string, unknown>[])
    await tx
      .insert(maintenanceIssues)
      .values(combine('maintenanceIssues') as never)
      .onConflictDoNothing()
    await tx
      .insert(maintenanceWorkOrders)
      .values(combine('workOrders') as never)
      .onConflictDoNothing()
    await tx
      .insert(operationalTaskTemplates)
      .values(combine('taskTemplates') as never)
      .onConflictDoNothing()
    await tx
      .insert(operationalTaskSchedules)
      .values(combine('taskSchedules') as never)
      .onConflictDoNothing()
    await tx
      .insert(operationalTaskOccurrences)
      .values(combine('occurrences') as never)
      .onConflictDoNothing()
    await tx
      .insert(operationalTaskLifecycleEvents)
      .values(combine('lifecycleEvents') as never)
      .onConflictDoNothing()
    await tx
      .insert(managerSignoffs)
      .values(combine('signoffs') as never)
      .onConflictDoNothing()
    await tx
      .insert(inspectionTypes)
      .values(combine('inspectionTypes') as never)
      .onConflictDoNothing()
    await tx
      .insert(inspectionTypeGroups)
      .values(combine('inspectionGroups') as never)
      .onConflictDoNothing()
    await tx
      .insert(inspectionTypeCriteria)
      .values(combine('inspectionCriteria') as never)
      .onConflictDoNothing()
    await tx
      .insert(inspectionRecords)
      .values(combine('inspectionRecords') as never)
      .onConflictDoNothing()
    await tx
      .insert(correctiveActions)
      .values(combine('correctiveActions') as never)
      .onConflictDoNothing()
    await tx
      .insert(inspectionRecordCriteria)
      .values(combine('recordCriteria') as never)
      .onConflictDoNothing()
    await tx
      .insert(documents)
      .values(combine('documents') as never)
      .onConflictDoNothing()
    await tx
      .insert(documentVersions)
      .values(combine('documentVersions') as never)
      .onConflictDoNothing()

    const registryDocuments = plan.registry.map((record, index) => ({
      id: record.evidenceDocumentId,
      tenantId: plan.tenantId,
      key: `CYCAS-HS-${String(index + 1).padStart(3, '0')}`,
      title: `${record.title} evidence`,
      description: 'Fictional demonstration evidence; not legal advice.',
      status: record.status === 'in_progress' ? ('under_review' as const) : ('published' as const),
      ownerTenantUserId: plan.staff[index % plan.staff.length]!.tenantUserId,
      reviewFrequencyMonths: 12,
      nextReviewOn: new Date(plan.now.getTime() + (index - 4) * 86_400_000)
        .toISOString()
        .slice(0, 10),
    }))
    await tx.insert(documents).values(registryDocuments).onConflictDoNothing()
    await tx
      .insert(documentVersions)
      .values(
        registryDocuments.map((document, index) => ({
          id: cycasId(`registry-version:${index}`),
          tenantId: plan.tenantId,
          documentId: document.id,
          version: 1,
          textContent: `${document.title}\n\nFictional Cycas Hospitality demonstration record.`,
          renderStatus: 'complete',
          publishedAt: plan.now,
          publishedBy: plan.staff[0]!.userId,
          changelog: 'Initial deterministic demo evidence.',
        })),
      )
      .onConflictDoNothing()
    const registryObligations = plan.registry.map((record, index) => ({
      id: record.id,
      tenantId: plan.tenantId,
      sourceModule: 'document' as const,
      subjectKind: 'per_record' as const,
      title: record.title,
      notes: 'Hotel H&S demonstration registry requirement; not legal advice.',
      status: 'active' as const,
      targetRef: { documentId: record.evidenceDocumentId, propertyId: record.propertyId },
      recurrence: { kind: 'expiry' as const, remindBeforeDays: 30 },
      recurrenceKind: 'expiry' as const,
      nextDueAt: new Date(plan.now.getTime() + (index - 3) * 86_400_000),
      sourceKey: `cycas-hs-${index + 1}`,
      sourceId: record.evidenceDocumentId,
      createdByTenantUserId: plan.staff[0]!.tenantUserId,
    }))
    await tx.insert(complianceObligations).values(registryObligations).onConflictDoNothing()
    await tx
      .insert(complianceStatus)
      .values(
        plan.registry.map((record, index) => ({
          id: cycasId(`registry-status:${index}`),
          tenantId: plan.tenantId,
          obligationId: record.id,
          personId: null,
          subjectRef: { documentId: record.evidenceDocumentId, propertyId: record.propertyId },
          subjectKey: `record:${record.evidenceDocumentId}`,
          periodStart: plan.now.toISOString().slice(0, 10),
          periodEnd: new Date(plan.now.getTime() + 365 * 86_400_000).toISOString().slice(0, 10),
          dueOn: new Date(plan.now.getTime() + (index - 3) * 86_400_000).toISOString().slice(0, 10),
          status: record.status as 'completed' | 'pending' | 'expiring' | 'overdue' | 'in_progress',
          completedOn:
            record.status === 'completed'
              ? new Date(plan.now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
              : null,
          count: record.status === 'completed' ? 1 : 0,
          expected: 1,
          percent: record.status === 'completed' ? 100 : 0,
          sourceRef: { propertyId: record.propertyId, documentId: record.evidenceDocumentId },
          computedAt: plan.now,
        })),
      )
      .onConflictDoNothing()
    await tx
      .insert(complianceObligations)
      .values(combine('complianceObligations') as never)
      .onConflictDoNothing()
    await tx
      .insert(complianceStatus)
      .values(combine('complianceStatuses') as never)
      .onConflictDoNothing()
    await tx
      .insert(incidents)
      .values(combine('incidents') as never)
      .onConflictDoNothing()
  })
}

try {
  await seed()
  console.log('Cycas Hospitality portfolio seed completed.')
  console.log(JSON.stringify(plan.expected, null, 2))
} finally {
  await pg.end()
}

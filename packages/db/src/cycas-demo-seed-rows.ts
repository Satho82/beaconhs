import { getTableColumns } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import {
  account,
  equipmentInspectionSchedules,
  trainingCourses,
  trainingRecords,
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
  buildCycasDemoSeedPlan,
  CYCAS_DEMO_SEED_KEY,
  CYCAS_DEMO_TENANT_SLUG,
  cycasId,
  getCycasDemoAccounts,
} from './cycas-demo-seed-plan'

export type CycasSeedBatch = { table: PgTable; rows: Record<string, unknown>[] }

export function buildCycasSeedBatches(plan = buildCycasDemoSeedPlan()): CycasSeedBatch[] {
  const batches: CycasSeedBatch[] = []
  const hotels = [plan.hotels.fenchurch, plan.hotels.lincoln]
  const uniqueAccounts = getCycasDemoAccounts(plan)
  const add = (table: PgTable, values: Record<string, unknown> | Record<string, unknown>[]) => {
    const columns = getTableColumns(table)
    const rows = (Array.isArray(values) ? values : [values]).map((row) => ({
      ...(columns.createdAt ? { createdAt: plan.now } : {}),
      ...(columns.updatedAt ? { updatedAt: plan.now } : {}),
      ...row,
    }))
    batches.push({ table, rows })
  }
  add(tenants, {
    id: plan.tenantId,
    slug: CYCAS_DEMO_TENANT_SLUG,
    name: 'Cycas Hospitality',
    status: 'active',
    region: 'eu-west-2',
    operationalTimezone: 'Europe/London',
    defaultCurrencyCode: 'GBP',
    dateFormat: 'DD/MM/YYYY',
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
  add(
    users,
    uniqueAccounts.map((member) => ({
      id: member.userId,
      email: member.email,
      emailVerified: true,
      name: `${member.firstName} ${member.lastName}`,
      isSuperAdmin: false,
      timezone: 'Europe/London',
    })),
  )
  add(
    account,
    uniqueAccounts.map((member) => ({
      id: cycasId(`credential:${member.key}`),
      userId: member.userId,
      accountId: member.userId,
      providerId: 'credential',
    })),
  )
  add(
    tenantUsers,
    uniqueAccounts.map((member) => ({
      id: member.tenantUserId,
      tenantId: plan.tenantId,
      userId: member.userId,
      displayName: `${member.firstName} ${member.lastName}`,
      status: 'active' as const,
      joinedAt: plan.now,
    })),
  )
  add(
    roles,
    plan.roles.map((role) => ({
      ...role,
      tenantId: plan.tenantId,
      description: `Cycas demo role: ${role.name}.`,
      isBuiltIn: false,
    })),
  )
  add(roleAssignments, plan.roleAssignments)

  const customerOrgUnitId = cycasId('org:customer')
  add(orgUnits, [
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
  add(
    people,
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
  add(
    peopleAssignments,
    plan.staff.flatMap((member) =>
      member.propertyIds.map((propertyId) => {
        const property = plan.properties.find((candidate) => candidate.id === propertyId)!
        return {
          id: cycasId(`people-assignment:${member.key}:${property.code}`),
          tenantId: plan.tenantId,
          personId: member.personId,
          orgUnitId: property.siteOrgUnitId,
          validFrom: '2026-10-01',
        }
      }),
    ),
  )

  for (const hotel of hotels) {
    add(
      people,
      hotel.contractors.map((person, index) => ({
        id: person.personId,
        tenantId: plan.tenantId,
        userId: null,
        employeeNo: `CYC-CON-${hotel.propertyId.slice(0, 8)}-${index + 1}`,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        status: 'active',
        notes: 'Fictional approved specialist contractor for the Cycas Board demo.',
        metadata: {
          demoSeedKey: CYCAS_DEMO_SEED_KEY,
          employmentType: 'contractor',
          company: person.company,
          propertyId: hotel.propertyId,
        },
      })),
    )
    add(
      peopleAssignments,
      hotel.contractors.map((person) => ({
        id: cycasId(`contractor-assignment:${person.personId}`),
        tenantId: plan.tenantId,
        personId: person.personId,
        orgUnitId: hotel.siteOrgUnitId,
        validFrom: '2026-10-01',
      })),
    )
  }
  add(
    hospitalityProperties,
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
  add(
    hospitalityBuildings,
    hotels.map((hotel, index) => ({
      id: hotel.buildingId,
      tenantId: plan.tenantId,
      propertyId: hotel.propertyId,
      name: index === 0 ? 'Fenchurch House' : 'Kingsway House',
      code: 'MAIN',
      metadata: { demoSeedKey: CYCAS_DEMO_SEED_KEY },
    })),
  )
  add(
    hospitalityFloors,
    hotels.flatMap((hotel) => hotel.floors),
  )
  add(
    hospitalityRooms,
    hotels.flatMap((hotel) => hotel.rooms),
  )
  add(
    qrTargets,
    hotels.flatMap((hotel) => hotel.qrTargets),
  )

  const moduleKeys = [
    'hospitality.properties',
    'hospitality.maintenance',
    'hospitality.compliance',
    'hospitality.diary',
    'hospitality.manager-signoff',
  ]
  add(
    tenantModuleEntitlements,
    moduleKeys.map((moduleKey) => ({
      id: cycasId(`entitlement:${moduleKey}`),
      tenantId: plan.tenantId,
      moduleKey,
      state: 'enabled' as const,
      effectiveFrom: null,
      changedByUserId: plan.staff[0]!.userId,
    })),
  )

  for (const [index, hotel] of hotels.entries()) {
    const prefix = index === 0 ? 'fenchurch' : 'lincoln'
    add(equipmentCategories, {
      id: cycasId(`equipment-category:${prefix}`),
      tenantId: plan.tenantId,
      name: `${plan.properties[index]!.name} Plant`,
      slug: `${prefix}-plant`,
      description: 'Hotel engineering and life-safety assets.',
      sortOrder: index + 1,
      enabledFieldGroups: ['manufacture', 'specifications', 'ownership'],
    })
    add(equipmentTypes, {
      id: cycasId(`equipment-type:${prefix}`),
      tenantId: plan.tenantId,
      name: `${plan.properties[index]!.name} Engineering Asset`,
      categoryId: cycasId(`equipment-category:${prefix}`),
      description: 'Fixed hotel plant.',
    })
    add(
      equipmentItems,
      hotel.equipment.map((item) => ({
        ...item,
        categoryId: cycasId(`equipment-category:${prefix}`),
        typeId: cycasId(`equipment-type:${prefix}`),
        metadata: { propertyId: hotel.propertyId, demoSeedKey: CYCAS_DEMO_SEED_KEY },
      })),
    )
  }

  for (const [propertyIndex, hotel] of hotels.entries()) {
    add(
      equipmentInspectionSchedules,
      hotel.equipment.map((item, index) => ({
        id: cycasId(`ppm:${item.id}`),
        tenantId: plan.tenantId,
        equipmentItemId: item.id,
        label: [
          'Quarterly fire alarm service',
          'Monthly lift service',
          'Quarterly hot-water plant service',
          'Monthly air-handling filters',
          'Monthly standby generator load test',
        ][index],
        intervalValue: index % 2 === 0 ? 3 : 1,
        intervalUnit: 'month',
        lastCompletedOn: '2026-09-01',
        nextDueOn: ['2026-10-10', '2026-10-16', '2026-10-20', '2026-11-01', '2026-10-14'][index],
        dueNotifiedFor: ['2026-10-10', '2026-10-16', '2026-10-20', '2026-11-01', '2026-10-14'][
          index
        ],
        isActive: true,
        notes: 'Fictional Cycas Board planned maintenance schedule.',
        createdByTenantUserId: hotel.staff[1]!.tenantUserId,
      })),
    )
    const courseNames = [
      'Fire safety and evacuation',
      'Legionella awareness',
      'Guest incident reporting',
    ]
    add(
      trainingCourses,
      courseNames.map((name, index) => ({
        id: cycasId(`course:${propertyIndex}:${index}`),
        tenantId: plan.tenantId,
        code: `${plan.properties[propertyIndex]!.code}-TRAIN-${index + 1}`,
        name: `${plan.properties[propertyIndex]!.name} — ${name}`,
        description: 'Fictional Cycas Board staff training course.',
        deliveryType: 'classroom',
        durationMinutes: 60,
        validForMonths: 12,
        metadata: { demoSeedKey: CYCAS_DEMO_SEED_KEY, propertyId: hotel.propertyId },
      })),
    )
    add(
      trainingRecords,
      hotel.staff.flatMap((member, memberIndex) =>
        courseNames.map((_, courseIndex) => ({
          id: cycasId(`training:${member.personId}:${courseIndex}`),
          tenantId: plan.tenantId,
          personId: member.personId,
          courseId: cycasId(`course:${propertyIndex}:${courseIndex}`),
          source: 'external_upload',
          completedOn: memberIndex < 2 ? '2025-10-10' : '2026-09-30',
          expiresOn:
            memberIndex === 0 ? '2026-10-10' : memberIndex === 1 ? '2026-10-25' : '2027-09-30',
          grade: 82 + memberIndex * 3,
          instructor: 'Cycas Demo Learning Team',
          issuedByTenantUserId: hotel.staff[0]!.tenantUserId,
          details: 'Fictional Board training evidence: practical scenario and knowledge check.',
          notes: `Cycas Board demo — ${plan.properties[propertyIndex]!.name}`,
        })),
      ),
    )
  }

  const combine = <K extends keyof (typeof hotels)[number]>(key: K) =>
    hotels.flatMap((hotel) => hotel[key] as unknown as readonly Record<string, unknown>[])
  add(maintenanceIssues, combine('maintenanceIssues'))
  add(maintenanceWorkOrders, combine('workOrders'))
  add(operationalTaskTemplates, combine('taskTemplates'))
  add(operationalTaskSchedules, combine('taskSchedules'))
  add(operationalTaskOccurrences, combine('occurrences'))
  add(operationalTaskLifecycleEvents, combine('lifecycleEvents'))
  add(managerSignoffs, combine('signoffs'))
  add(inspectionTypes, combine('inspectionTypes'))
  add(inspectionTypeGroups, combine('inspectionGroups'))
  add(inspectionTypeCriteria, combine('inspectionCriteria'))
  add(
    inspectionRecords,
    hotels.flatMap((hotel) =>
      hotel.inspectionRecords.map((record) => ({ ...record, customerOrgUnitId })),
    ),
  )
  add(correctiveActions, combine('correctiveActions'))
  add(inspectionRecordCriteria, combine('recordCriteria'))
  add(documents, combine('documents'))
  add(documentVersions, combine('documentVersions'))

  const dueOffset = (status: string) =>
    status === 'overdue' ? -7 : status === 'expiring' ? 14 : status === 'completed' ? 180 : 3
  const registryDocuments = plan.registry.map((record, index) => ({
    id: record.evidenceDocumentId,
    tenantId: plan.tenantId,
    key: `CYCAS-HS-${String(index + 1).padStart(3, '0')}`,
    title: `${record.title} evidence`,
    description: 'Fictional demonstration evidence; not legal advice.',
    status: record.status === 'in_progress' ? ('under_review' as const) : ('published' as const),
    ownerTenantUserId: plan.staff[index % plan.staff.length]!.tenantUserId,
    reviewFrequencyMonths: 12,
    nextReviewOn: new Date(plan.now.getTime() + dueOffset(record.status) * 86_400_000)
      .toISOString()
      .slice(0, 10),
  }))
  add(documents, registryDocuments)
  add(
    documentVersions,
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
    nextDueAt: new Date(plan.now.getTime() + dueOffset(record.status) * 86_400_000),
    sourceKey: `cycas-hs-${index + 1}`,
    sourceId: record.evidenceDocumentId,
    createdByTenantUserId: plan.staff[0]!.tenantUserId,
  }))
  add(complianceObligations, registryObligations)
  add(
    complianceStatus,
    plan.registry.map((record, index) => ({
      id: cycasId(`registry-status:${index}`),
      tenantId: plan.tenantId,
      obligationId: record.id,
      personId: null,
      subjectRef: { documentId: record.evidenceDocumentId, propertyId: record.propertyId },
      subjectKey: `record:${record.evidenceDocumentId}`,
      periodStart: plan.now.toISOString().slice(0, 10),
      periodEnd: new Date(plan.now.getTime() + 365 * 86_400_000).toISOString().slice(0, 10),
      dueOn: new Date(plan.now.getTime() + dueOffset(record.status) * 86_400_000)
        .toISOString()
        .slice(0, 10),
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
  add(
    complianceObligations,
    hotels.flatMap((hotel) =>
      hotel.complianceObligations.map((row) => ({
        ...row,
        targetRef: { ...row.targetRef, propertyId: hotel.propertyId },
      })),
    ),
  )
  add(complianceStatus, combine('complianceStatuses'))
  add(incidents, combine('incidents'))
  return batches
}

import { createHash } from 'node:crypto'
import { buildDemoHotelSeedPlan } from './demo-hotel-seed-plan'

export const CYCAS_DEMO_TENANT_SLUG = 'cycas-hospitality-demo'
export const CYCAS_DEMO_SEED_KEY = 'cycas-hospitality-portfolio-v1'
export const CYCAS_BOARD_ANCHOR = '2026-10-15T12:00:00.000Z'

export function cycasId(key: string): string {
  const bytes = createHash('sha256')
    .update(`${CYCAS_DEMO_SEED_KEY}:${key}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

type CycasSeedEnvironment = {
  UVANOO_CYCAS_SEED_TARGET?: string
  UVANOO_CYCAS_SEED_CONFIRM?: string
  DATABASE_URL?: string
  SUPERADMIN_DATABASE_URL?: string
  NODE_ENV?: string
  SENTRY_ENVIRONMENT?: string
}

export function assertCycasSeedEnvironment(env: CycasSeedEnvironment): void {
  const target = env.UVANOO_CYCAS_SEED_TARGET
  if (target !== 'development')
    throw new Error(
      'UVANOO_CYCAS_SEED_TARGET must be exactly development; staging/production forbidden',
    )
  if (env.UVANOO_CYCAS_SEED_CONFIRM !== 'SEED_CYCAS_HOSPITALITY_DEVELOPMENT')
    throw new Error('UVANOO_CYCAS_SEED_CONFIRM must be exactly SEED_CYCAS_HOSPITALITY_DEVELOPMENT')
  const rawUrl = env.SUPERADMIN_DATABASE_URL ?? env.DATABASE_URL
  if (!rawUrl) throw new Error('A database URL is required')
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Invalid database URL')
  }
  const database = url.pathname.replace(/^\//, '')
  if (env.SENTRY_ENVIRONMENT && !['development', 'test'].includes(env.SENTRY_ENVIRONMENT))
    throw new Error('Only development/test environments are permitted')
  if (
    !['development', 'test'].includes(env.NODE_ENV ?? '') ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !new Set(['localhost', '127.0.0.1', '::1', 'db', 'postgres']).has(url.hostname)
  )
    throw new Error('Development seed requires a non-production runtime and local database host')
  if (database !== 'beaconhs' && !/(^|[_-])(dev|development|test)([_-]|$)/i.test(database))
    throw new Error('Development database name must be beaconhs or clearly marked dev/test')
}

const permissions = {
  admin: [
    'admin.users.manage',
    'admin.org.manage',
    'dashboards.read',
    'equipment.read.all',
    'equipment.manage',
    'inspections.read.all',
    'inspections.create',
    'inspections.update',
    'documents.read',
    'training.read.all',
    'incidents.read.all',
    'ca.read.all',
    'hospitality.read',
    'hospitality.manage',
    'maintenance.read',
    'maintenance.create',
    'maintenance.update',
    'maintenance.verify',
    'compliance.read',
    'compliance.manage',
    'operational_tasks.read',
    'operational_tasks.manage',
    'hospitality.signoff.complete',
  ],
  manager: [
    'dashboards.read',
    'equipment.read.all',
    'inspections.read.all',
    'documents.read',
    'training.read.all',
    'incidents.read.all',
    'ca.read.all',
    'hospitality.read',
    'hospitality.manage',
    'maintenance.read',
    'maintenance.create',
    'maintenance.update',
    'maintenance.verify',
    'compliance.read',
    'operational_tasks.read',
    'operational_tasks.manage',
    'hospitality.signoff.complete',
  ],
  frontOffice: [
    'hospitality.read',
    'maintenance.read',
    'maintenance.create',
    'operational_tasks.read',
  ],
  engineer: [
    'equipment.read.all',
    'equipment.inspect',
    'inspections.read.all',
    'ca.read.all',
    'hospitality.read',
    'maintenance.read',
    'maintenance.create',
    'maintenance.update',
    'maintenance.verify',
    'operational_tasks.read',
    'operational_tasks.complete',
  ],
  safety: [
    'hospitality.read',
    'compliance.read',
    'compliance.manage',
    'inspections.read.all',
    'inspections.create',
    'inspections.update',
    'incidents.read.all',
    'incidents.create',
    'documents.read',
    'training.read.all',
    'equipment.read.all',
    'ca.read.all',
    'operational_tasks.read',
    'dashboards.read',
  ],
  restricted: ['hospitality.read', 'maintenance.read', 'operational_tasks.read'],
} as const

const CYCAS_DEMO_EMAIL_DOMAIN = 'cycas.demo.uvanoo.invalid'

function namespaceHotelPlan(
  hotel: ReturnType<typeof buildDemoHotelSeedPlan>,
  property: 'fenchurch' | 'lincoln',
): ReturnType<typeof buildDemoHotelSeedPlan> {
  const codePrefix = property === 'fenchurch' ? 'OFF' : 'TLS'
  const propertyName = property === 'fenchurch' ? 'One Fifty Fenchurch' : 'The Lincoln Suites'
  return {
    ...hotel,
    rooms: hotel.rooms.map((room) => ({
      ...room,
      code: `${codePrefix}-${room.code}`,
      roomType:
        property === 'lincoln'
          ? room.code === '001'
            ? 'Accessible Studio'
            : Number(room.code) % 3 === 0
              ? 'One Bedroom Suite'
              : 'Studio'
          : room.roomType,
    })),
    incidents: hotel.incidents.map((incident) => ({
      ...incident,
      reference: `${codePrefix}-${incident.reference}`,
    })),
    complianceObligations: hotel.complianceObligations.map((obligation) => ({
      ...obligation,
      sourceKey: `${codePrefix}-${obligation.sourceKey}`,
    })),
    documentVersions: hotel.documentVersions.map((version, index) => ({
      ...version,
      textContent: `${propertyName} — ${hotel.documents[index]!.title}

Fictional Cycas Board demonstration record.
Owner: hotel management. Escalate overdue actions to the Cluster GM.`,
    })),
    maintenanceIssues: hotel.maintenanceIssues.map((issue) => ({
      ...issue,
      reference: `${codePrefix}-${issue.reference}`,
    })),
    workOrders: hotel.workOrders.map((order) => ({
      ...order,
      reference: `${codePrefix}-${order.reference}`,
    })),
    equipment: hotel.equipment.map((item) => ({
      ...item,
      assetTag: `${codePrefix}-${item.assetTag}`,
    })),
    inspectionTypes: hotel.inspectionTypes.map((type) => ({
      ...type,
      name: `${propertyName} — ${type.name}`,
    })),
    inspectionRecords: hotel.inspectionRecords.map((record) => ({
      ...record,
      reference: `${codePrefix}-${record.reference}`,
    })),
    documents: hotel.documents.map((document) => ({
      ...document,
      key: `${codePrefix}-${document.key}`,
    })),
    staff: hotel.staff.map((member, index) => ({
      ...member,
      ...(property === 'lincoln'
        ? {
            firstName: ['Oliver', 'Aisha', 'Isabel', 'Leo', 'Freya'][index]!,
            lastName: ['Grant', 'Khan', 'Costa', 'Martin', 'Wilson'][index]!,
          }
        : {}),
      email: `${property}.${member.key}@${CYCAS_DEMO_EMAIL_DOMAIN}`,
    })),
    contractors: hotel.contractors.map((contractor) => ({
      ...contractor,
      email: `${property}.${contractor.key}@${CYCAS_DEMO_EMAIL_DOMAIN}`,
    })),
  }
}

export function buildCycasDemoSeedPlan(anchor = new Date(CYCAS_BOARD_ANCHOR)) {
  const tenantId = cycasId('tenant')
  const fenchurch = namespaceHotelPlan(
    buildDemoHotelSeedPlan(anchor, {
      seedKey: CYCAS_DEMO_SEED_KEY,
      tenantId,
      namespace: 'fenchurch',
    }),
    'fenchurch',
  )
  const lincolnAnchor = new Date(anchor)
  const lincoln = namespaceHotelPlan(
    buildDemoHotelSeedPlan(lincolnAnchor, {
      seedKey: CYCAS_DEMO_SEED_KEY,
      tenantId,
      namespace: 'lincoln',
      roomsPerFloor: [10, 11, 11, 11, 11],
    }),
    'lincoln',
  )
  const properties = [
    {
      id: fenchurch.propertyId,
      tenantId,
      name: 'One Fifty Fenchurch',
      code: 'OFF',
      address: {
        line1: '150 Fenchurch Street',
        city: 'London',
        postalCode: 'EC3M 6BB',
        country: 'GB',
      },
      timezone: 'Europe/London',
      siteOrgUnitId: fenchurch.siteOrgUnitId,
    },
    {
      id: lincoln.propertyId,
      tenantId,
      name: 'The Lincoln Suites',
      code: 'TLS',
      address: { line1: '37-39 Kingsway', city: 'London', postalCode: 'WC2B 6TP', country: 'GB' },
      timezone: 'Europe/London',
      siteOrgUnitId: lincoln.siteOrgUnitId,
    },
  ]
  const identities = [
    [
      'demo-admin',
      'Avery',
      'Morgan',
      'Demo Administrator',
      'admin',
      [fenchurch.propertyId, lincoln.propertyId],
    ],
    [
      'cluster-gm',
      'Jordan',
      'Ellis',
      'Cluster General Manager',
      'manager',
      [fenchurch.propertyId, lincoln.propertyId],
    ],
    ['fenchurch-manager', 'Priya', 'Shah', 'Hotel Manager', 'manager', [fenchurch.propertyId]],
    ['lincoln-manager', 'Marcus', 'Reed', 'Hotel Manager', 'manager', [lincoln.propertyId]],
    [
      'fenchurch-front-office',
      'Elena',
      'Ward',
      'Front Office Supervisor',
      'frontOffice',
      [fenchurch.propertyId],
    ],
    [
      'lincoln-front-office',
      'Theo',
      'Bennett',
      'Front Office Supervisor',
      'frontOffice',
      [lincoln.propertyId],
    ],
    [
      'engineer',
      'Nadia',
      'Cole',
      'Cluster Maintenance Engineer',
      'engineer',
      [fenchurch.propertyId, lincoln.propertyId],
    ],
    [
      'safety-compliance',
      'Riley',
      'Brooks',
      'Cluster Safety and Compliance Manager',
      'safety',
      [fenchurch.propertyId, lincoln.propertyId],
    ],
    [
      'restricted-operations',
      'Jamie',
      'Blake',
      'Operations Assistant',
      'restricted',
      [lincoln.propertyId],
    ],
  ] as const
  const boardStaff = identities.map(([key, firstName, lastName, title, roleKey, propertyIds]) => ({
    key,
    userId: cycasId(`user:${key}`),
    tenantUserId: cycasId(`member:${key}`),
    personId: cycasId(`person:${key}`),
    email: `${key}@${CYCAS_DEMO_EMAIL_DOMAIN}`,
    firstName,
    lastName,
    title,
    roleKey,
    propertyIds: [...propertyIds],
  }))
  const staff = [
    ...boardStaff,
    ...[fenchurch, lincoln].flatMap((hotel, propertyIndex) =>
      hotel.staff.map((member) => ({
        ...member,
        key: `${propertyIndex === 0 ? 'fenchurch' : 'lincoln'}-ops-${member.key}`,
        roleKey: (member.key === 'gm' || member.key === 'duty'
          ? 'manager'
          : member.key === 'front-office'
            ? 'frontOffice'
            : 'engineer') as keyof typeof permissions,
        propertyIds: [hotel.propertyId],
      })),
    ),
  ]
  const roles = Object.entries(permissions).map(([key, rolePermissions]) => ({
    id: cycasId(`role:${key}`),
    key,
    name:
      key === 'frontOffice'
        ? 'Front Office'
        : key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    permissions: [...rolePermissions],
  }))
  const roleAssignments = staff.map((member) => ({
    id: cycasId(`role-assignment:${member.key}`),
    tenantId,
    tenantUserId: member.tenantUserId,
    roleId: cycasId(`role:${member.roleKey}`),
    scope: { type: 'properties' as const, propertyIds: member.propertyIds },
  }))
  const complianceTopics = [
    'Fire Risk Assessment',
    'Fire alarm servicing',
    'Weekly fire alarm testing',
    'Emergency lighting',
    'Fire extinguishers',
    'Sprinkler and riser inspection',
    'Fire evacuation plan review',
    'Fire door inspection',
    'Legionella L8 risk assessment',
    'Water temperature monitoring',
    'Water sampling',
    'EICR',
    'PAT programme',
    'Lift maintenance and statutory examination',
    'Gas safety',
    'Asbestos register review',
    'F-Gas and air-conditioning records',
    'Kitchen extract cleaning',
    'General H&S risk assessment',
    'First aid and emergency arrangements',
    'Workplace inspection',
    'Contractor compliance review',
  ]
  const registry = properties.flatMap((property, propertyIndex) =>
    complianceTopics.map((title, index) => ({
      id: cycasId(`registry:${property.code}:${index}`),
      propertyId: property.id,
      title,
      status:
        index === (propertyIndex ? 6 : 10)
          ? 'overdue'
          : propertyIndex === 1 && index === 15
            ? 'in_progress'
            : index % 6 === 0
              ? 'expiring'
              : index % 5 === 0
                ? 'pending'
                : 'completed',
      contractor: index % 3 === 0 ? 'Approved specialist contractor' : null,
      evidenceDocumentId: cycasId(`document:${property.code}:${index}`),
      correctiveActionId:
        index === (propertyIndex ? 6 : 10) ? cycasId(`corrective:${property.code}:${index}`) : null,
    })),
  )
  return {
    now: new Date(anchor),
    tenantId,
    managementCompany: { id: tenantId, name: 'Cycas Hospitality', slug: CYCAS_DEMO_TENANT_SLUG },
    properties,
    hotels: { fenchurch, lincoln },
    staff,
    roles,
    roleAssignments,
    registry,
    expected: {
      managementCompanies: 1,
      properties: 2,
      propertyNames: properties.map((property) => property.name),
      users: staff.length,
      clusterGmPropertyAssignments: 2,
      rooms: { fenchurch: fenchurch.rooms.length, lincoln: lincoln.rooms.length },
      maintenanceIssues: {
        fenchurch: fenchurch.maintenanceIssues.length,
        lincoln: lincoln.maintenanceIssues.length,
      },
      complianceRegistry: { fenchurch: complianceTopics.length, lincoln: complianceTopics.length },
      operationalRecords: {
        fenchurch:
          fenchurch.occurrences.length +
          fenchurch.inspectionRecords.length +
          fenchurch.incidents.length,
        lincoln:
          lincoln.occurrences.length + lincoln.inspectionRecords.length + lincoln.incidents.length,
      },
    },
  }
}

type CycasDemoAccount = {
  email: string
  userId: string
}

export function getCycasDemoAccounts(plan: ReturnType<typeof buildCycasDemoSeedPlan>) {
  const accounts = plan.staff
  return [...new Map(accounts.map((account) => [account.userId, account])).values()]
}

export function findCycasDemoIdentityCollisions(
  accounts: readonly CycasDemoAccount[],
  existing: readonly CycasDemoAccount[],
): CycasDemoAccount[] {
  const expected = new Map(accounts.map((account) => [account.email, account.userId]))
  return existing.filter((account) => {
    const expectedId = expected.get(account.email)
    return expectedId !== undefined && expectedId !== account.userId
  })
}

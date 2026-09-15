import { createHash } from 'node:crypto'

export const DEMO_HOTEL_TENANT_SLUG = 'uvanoo-demo-hotel'
export const DEMO_HOTEL_SEED_KEY = 'uvanoo-demo-hotel-v1'

export type DemoHotelSeedEnvironment = {
  UVANOO_DEMO_SEED_TARGET?: string
  UVANOO_DEMO_SEED_CONFIRM?: string
  DATABASE_URL?: string
  SUPERADMIN_DATABASE_URL?: string
  NODE_ENV?: string
  SENTRY_ENVIRONMENT?: string
}

export function demoId(key: string): string {
  const bytes = createHash('sha256')
    .update(`${DEMO_HOTEL_SEED_KEY}:${key}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function demoToken(key: string): string {
  return createHash('sha256').update(`${DEMO_HOTEL_SEED_KEY}:token:${key}`).digest('base64url')
}

export function assertDemoHotelSeedEnvironment(env: DemoHotelSeedEnvironment): void {
  const target = env.UVANOO_DEMO_SEED_TARGET
  if (target !== 'development' && target !== 'staging') {
    throw new Error('UVANOO_DEMO_SEED_TARGET must be exactly development or staging')
  }
  const expected = `SEED_UVANOO_DEMO_HOTEL_${target.toUpperCase()}`
  if (env.UVANOO_DEMO_SEED_CONFIRM !== expected) {
    throw new Error(`UVANOO_DEMO_SEED_CONFIRM must be exactly ${expected}`)
  }
  const rawUrl = env.SUPERADMIN_DATABASE_URL ?? env.DATABASE_URL
  if (!rawUrl) throw new Error('A database URL is required')
  const url = new URL(rawUrl)
  const database = url.pathname.replace(/^\//, '')
  if (target === 'staging') {
    if (env.SENTRY_ENVIRONMENT !== 'staging' || database !== 'uvanoo_staging') {
      throw new Error(
        'Staging seed requires SENTRY_ENVIRONMENT=staging and database uvanoo_staging',
      )
    }
    return
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'db', 'postgres'])
  if (env.NODE_ENV === 'production' || !localHosts.has(url.hostname)) {
    throw new Error('Development seed requires a non-production runtime and local database host')
  }
  if (database !== 'beaconhs' && !/(^|[_-])(dev|development|test)([_-]|$)/i.test(database)) {
    throw new Error('Development database name must be beaconhs or clearly marked dev/test')
  }
}
const DAY = 86_400_000

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY)
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function utcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function utcWeekStart(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = start.getUTCDay()
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1))
  return start
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    const name = key(value)
    counts[name] = (counts[name] ?? 0) + 1
    return counts
  }, {})
}

export function buildDemoHotelSeedPlan(anchor = new Date()) {
  const now = new Date(anchor)
  const weekStart = utcWeekStart(now)
  const monthStart = utcMonthStart(now)
  const currentPeriodPast = new Date(
    Math.max(weekStart.getTime() + 60_000, now.getTime() - 3_600_000),
  )
  const tenantId = demoId('tenant')
  const propertyId = demoId('property')
  const buildingId = demoId('building')
  const customerOrgUnitId = demoId('org:customer')
  const siteOrgUnitId = demoId('org:site')

  const floors = [
    ['ground', 'Ground Floor', 'G', '0'],
    ['first', 'First Floor', '1', '1'],
    ['second', 'Second Floor', '2', '2'],
    ['third', 'Third Floor', '3', '3'],
    ['fourth', 'Fourth Floor', '4', '4'],
  ].map(([key, name, code, sortOrder]) => ({
    id: demoId(`floor:${key}`),
    tenantId,
    buildingId,
    name: name!,
    code: code!,
    sortOrder: sortOrder!,
    metadata: { demoSeedKey: DEMO_HOTEL_SEED_KEY },
  }))

  const roomNumbers = [
    '001',
    '002',
    '003',
    '004',
    '005',
    ...Array.from({ length: 7 }, (_, i) => `10${i + 1}`),
    ...Array.from({ length: 7 }, (_, i) => `20${i + 1}`),
    ...Array.from({ length: 7 }, (_, i) => `30${i + 1}`),
    ...Array.from({ length: 7 }, (_, i) => `40${i + 1}`),
  ]
  const roomStatuses = [
    'occupied',
    'maintenance',
    'blocked',
    'out_of_service',
    'maintenance',
    ...Array(3).fill('occupied'),
    ...Array(25).fill('available'),
  ] as const
  const floorForRoom = (number: string) => floors[number.startsWith('0') ? 0 : Number(number[0])]!
  const roomTypeFor = (number: string) =>
    number.endsWith('7') || number === '005'
      ? 'Junior Suite'
      : number === '001'
        ? 'Accessible King'
        : Number(number) % 3 === 0
          ? 'Classic Twin'
          : 'Classic King'
  const rooms = roomNumbers.map((code, index) => ({
    id: demoId(`room:${code}`),
    tenantId,
    floorId: floorForRoom(code).id,
    code,
    name: `Room ${code}`,
    roomType: roomTypeFor(code),
    status: roomStatuses[index]!,
    metadata: {
      beds: roomTypeFor(code).includes('Twin') ? 2 : 1,
      demoSeedKey: DEMO_HOTEL_SEED_KEY,
    },
  }))
  const qrTargets = rooms.map((room) => ({
    id: demoId(`qr:${room.code}`),
    tenantId,
    token: demoToken(`room:${room.code}`),
    kind: 'room' as const,
    roomId: room.id,
    equipmentItemId: null,
    isActive: true,
  }))
  const staff = [
    ['gm', 'Amelia', 'Hart', 'General Manager'],
    ['maintenance', 'Daniel', 'Okafor', 'Maintenance Manager'],
    ['duty', 'Sofia', 'Martinez', 'Duty Manager'],
    ['engineer', 'Liam', 'Chen', 'Hotel Engineer'],
    ['front-office', 'Maya', 'Patel', 'Front Office Supervisor'],
  ].map(([key, firstName, lastName, title]) => ({
    key: key!,
    userId: demoId(`user:${key}`),
    tenantUserId: demoId(`member:${key}`),
    personId: demoId(`person:${key}`),
    email: `${key}@demo.uvanoo.invalid`,
    firstName: firstName!,
    lastName: lastName!,
    title: title!,
  }))
  const contractors = [
    ['contractor-lift', 'Noah', 'Williams', 'Apex Lift Services'],
    ['contractor-fire', 'Grace', 'Kim', 'Sentinel Fire Systems'],
    ['contractor-hvac', 'Ethan', 'Brown', 'Northstar HVAC'],
  ].map(([key, firstName, lastName, company]) => ({
    key: key!,
    personId: demoId(`person:${key}`),
    firstName: firstName!,
    lastName: lastName!,
    company: company!,
    email: `${key}@demo.uvanoo.invalid`,
  }))
  const roles = [
    {
      key: 'hotel-general-manager',
      name: 'Hotel General Manager',
      permissions: [
        'hospitality.read',
        'hospitality.manage',
        'maintenance.read',
        'maintenance.create',
        'maintenance.update',
        'maintenance.verify',
        'operational_tasks.read',
        'operational_tasks.manage',
        'operational_tasks.complete',
        'hospitality.signoff.complete',
        'inspections.read.all',
        'inspections.create',
        'inspections.update',
        'inspections.manage',
        'documents.read',
        'documents.manage',
        'documents.review',
        'compliance.read',
        'compliance.manage',
        'compliance.assign',
        'ca.read.all',
        'ca.create',
        'ca.update',
        'ca.verify',
        'incidents.read.all',
        'incidents.create',
        'incidents.update',
        'incidents.investigate',
        'incidents.close',
        'equipment.read.all',
        'equipment.manage',
        'dashboards.read',
        'reports.read',
      ],
    },
    {
      key: 'hotel-maintenance-manager',
      name: 'Hotel Maintenance Manager',
      permissions: [
        'hospitality.read',
        'maintenance.read',
        'maintenance.create',
        'maintenance.update',
        'maintenance.verify',
        'operational_tasks.read',
        'operational_tasks.manage',
        'operational_tasks.complete',
        'inspections.read.all',
        'inspections.create',
        'inspections.update',
        'equipment.read.all',
        'equipment.manage',
        'ca.read.all',
        'ca.create',
        'ca.update',
        'documents.read',
        'compliance.read',
        'dashboards.read',
      ],
    },
    {
      key: 'hotel-duty-manager',
      name: 'Hotel Duty Manager',
      permissions: [
        'hospitality.read',
        'maintenance.read',
        'maintenance.create',
        'maintenance.update',
        'operational_tasks.read',
        'operational_tasks.complete',
        'hospitality.signoff.complete',
        'inspections.read.all',
        'inspections.create',
        'inspections.update',
        'documents.read',
        'compliance.read',
        'incidents.read.all',
        'incidents.create',
        'incidents.update',
        'dashboards.read',
      ],
    },
    {
      key: 'hotel-engineer',
      name: 'Hotel Engineer',
      permissions: [
        'hospitality.read',
        'maintenance.read',
        'maintenance.update',
        'operational_tasks.read',
        'operational_tasks.complete',
        'inspections.read.self',
        'inspections.create',
        'inspections.update',
        'equipment.read.all',
        'equipment.inspect',
        'ca.read.self',
        'ca.update',
        'documents.read',
      ],
    },
    {
      key: 'hotel-front-office',
      name: 'Hotel Front Office',
      permissions: [
        'hospitality.read',
        'maintenance.read',
        'maintenance.create',
        'operational_tasks.read',
        'documents.read',
        'incidents.read.self',
        'incidents.create',
        'dashboards.read',
      ],
    },
  ]
  const maintenanceSpecs = [
    ['001', 'reported', 'high', 'guest_qr', 'Bathroom ceiling leak'],
    ['002', 'reported', 'medium', 'guest_qr', 'Air conditioning not cooling'],
    ['003', 'acknowledged', 'low', 'staff', 'Loose wardrobe handle'],
    ['004', 'assigned', 'high', 'staff', 'Intermittent power at desk sockets'],
    ['005', 'assigned', 'medium', 'inspection', 'Fire door closer requires adjustment'],
    ['101', 'in_progress', 'critical', 'guest_qr', 'Burning smell from fan-coil unit'],
    ['102', 'in_progress', 'high', 'scheduled_task', 'Hot water temperature below target'],
    ['103', 'awaiting_parts', 'medium', 'staff', 'Replacement shower cartridge required'],
    ['104', 'completed', 'medium', 'guest_qr', 'Television signal restored'],
    ['105', 'completed', 'low', 'inspection', 'Bedside lamp replaced'],
    ['106', 'closed', 'high', 'api_integration', 'Lift landing call button repaired'],
    ['107', 'cancelled', 'medium', 'staff', 'Duplicate report for corridor lighting'],
  ] as const
  const maintenanceIssues = maintenanceSpecs.map(
    ([room, status, priority, source, summary], index) => ({
      id: demoId(`issue:${index + 1}`),
      tenantId,
      roomId: demoId(`room:${room}`),
      equipmentItemId: null,
      reference: `HOT-MNT-${String(index + 1).padStart(4, '0')}`,
      status,
      priority,
      source,
      summary,
      description: `Demo scenario: ${summary.toLowerCase()}.`,
      reportedByTenantUserId:
        source === 'guest_qr' ? null : staff[(index + 2) % staff.length]!.tenantUserId,
      publicSubmissionId: source === 'guest_qr' ? demoId(`public-submission:${index + 1}`) : null,
      guestName: source === 'guest_qr' ? ['Alex', null, 'Jordan', 'Taylor'][index % 4] : null,
      guestContact: null,
      guestContactConsent: false,
      assignedToTenantUserId: [
        'assigned',
        'in_progress',
        'awaiting_parts',
        'completed',
        'closed',
      ].includes(status)
        ? staff[3]!.tenantUserId
        : null,
      completedAt: ['completed', 'closed'].includes(status) ? addDays(now, -1 - index / 10) : null,
      completedByTenantUserId: ['completed', 'closed'].includes(status)
        ? staff[3]!.tenantUserId
        : null,
      resolutionNotes: ['completed', 'closed'].includes(status)
        ? 'Repair completed and room function checked.'
        : null,
      createdAt: addDays(now, -index - 1),
      updatedAt: now,
    }),
  )
  const workOrderStatuses = [
    'assigned',
    'assigned',
    'in_progress',
    'in_progress',
    'awaiting_parts',
    'completed',
    'verified',
    'closed',
  ] as const
  const workOrderIssueIndexes = [3, 4, 5, 6, 7, 8, 9, 10]
  const workOrders = workOrderIssueIndexes.map((issueIndex, index) => ({
    id: demoId(`work-order:${index + 1}`),
    tenantId,
    issueId: maintenanceIssues[issueIndex]!.id,
    reference: `HOT-WO-${String(index + 1).padStart(4, '0')}`,
    status: workOrderStatuses[index]!,
    assignedToTenantUserId: staff[3]!.tenantUserId,
    verifiedByTenantUserId: ['verified', 'closed'].includes(workOrderStatuses[index]!)
      ? staff[1]!.tenantUserId
      : null,
    completedAt: ['completed', 'verified', 'closed'].includes(workOrderStatuses[index]!)
      ? addDays(now, -1)
      : null,
    verifiedAt: ['verified', 'closed'].includes(workOrderStatuses[index]!)
      ? addDays(now, -0.5)
      : null,
    closedAt: workOrderStatuses[index] === 'closed' ? now : null,
    actionTaken: ['completed', 'verified', 'closed'].includes(workOrderStatuses[index]!)
      ? 'Defect rectified; functional test passed.'
      : null,
  }))
  const taskTitles = [
    ['Fire alarm panel daily check', '0 7 * * *', false],
    ['Plant room morning inspection', '0 8 * * *', true],
    ['Guest corridor safety walk', '0 9 * * *', true],
    ['Domestic hot water temperatures', '0 10 * * 1', true],
    ['Emergency lighting spot check', '0 11 * * 2', false],
    ['Lift alarm communication test', '0 12 * * 3', true],
    ['Guest room fire-door inspection', '0 9 1 * *', true],
    ['Fan-coil filter rotation', '0 10 1 * *', false],
  ] as const
  const taskTemplates = taskTitles.map(([title, cron, requiresEvidence], index) => ({
    id: demoId(`task-template:${index + 1}`),
    tenantId,
    title,
    instructions: `Follow the hotel SOP for ${title.toLowerCase()} and record any exception.`,
    requiresEvidence,
  }))
  const taskSchedules = taskTemplates.map((template, index) => ({
    id: demoId(`task-schedule:${index + 1}`),
    tenantId,
    templateId: template.id,
    propertyId,
    timezone: 'Europe/London',
    recurrence: { kind: 'cron', cron: taskTitles[index]![1], dueOffsetMinutes: 60 },
    startsAt: addDays(monthStart, -60),
    isActive: true,
    assignedToTenantUserId: index % 2 === 0 ? staff[2]!.tenantUserId : staff[3]!.tenantUserId,
  }))
  const occurrenceStatuses = [
    'completed',
    'completed',
    'completed',
    'completed',
    'overdue',
    'escalated',
    'in_progress',
    'open',
    'open',
    'open',
    'waived',
    'cancelled',
  ] as const
  const occurrences = occurrenceStatuses.map((status, index) => {
    const inCurrentWeek = index < 8
    const dueAt = inCurrentWeek
      ? index < 4
        ? new Date(weekStart.getTime() + (index + 1) * 3_600_000)
        : index < 6
          ? currentPeriodPast
          : new Date(weekStart.getTime() + (index === 6 ? 60 : 84) * 3_600_000)
      : addDays(now, index - 6)
    return {
      id: demoId(`occurrence:${index + 1}`),
      tenantId,
      scheduleId: taskSchedules[index % taskSchedules.length]!.id,
      occurrenceAt: new Date(dueAt.getTime() - 3_600_000),
      dueAt,
      status,
      assignedToTenantUserId: taskSchedules[index % taskSchedules.length]!.assignedToTenantUserId,
      completedAt: status === 'completed' ? new Date(dueAt.getTime() - 900_000) : null,
      completedByTenantUserId: status === 'completed' ? staff[3]!.tenantUserId : null,
      completionNotes:
        status === 'completed'
          ? 'Completed to hotel operating standard; no exception noted.'
          : null,
    }
  })
  const lifecycleEvents = [4, 5, 6, 7].map((occurrenceIndex, index) => ({
    id: demoId(`lifecycle:${index + 1}`),
    tenantId,
    occurrenceId: occurrences[occurrenceIndex]!.id,
    stage: (
      ['overdue_notification', 'escalated', 'due_notification', 'upcoming_reminder'] as const
    )[index]!,
    recipientUserId: staff[index % staff.length]!.userId,
    processedAt: now,
    metadata: { demoSeedKey: DEMO_HOTEL_SEED_KEY },
  }))
  const inspectionTypes = [
    {
      id: demoId('inspection-type:room'),
      tenantId,
      name: 'Guest Room Quality & Safety',
      description: 'Operational room inspection covering safety, condition, and guest readiness.',
      requiresForeman: false,
      requiresCustomerSignature: false,
      enableCorrectiveActions: true,
      allowCompliantNotes: true,
      defaultCadence: 'month',
      availableTo: null,
      notifyPersonIds: [],
      isPublished: true,
      createdBy: staff[0]!.userId,
    },
    {
      id: demoId('inspection-type:plant'),
      tenantId,
      name: 'Hotel Plant & Life Safety',
      description: 'Plant-room and life-safety systems inspection.',
      requiresForeman: false,
      requiresCustomerSignature: false,
      enableCorrectiveActions: true,
      allowCompliantNotes: true,
      defaultCadence: 'week',
      availableTo: null,
      notifyPersonIds: [],
      isPublished: true,
      createdBy: staff[1]!.userId,
    },
  ]
  const inspectionGroups = inspectionTypes.map((type, index) => ({
    id: demoId(`inspection-group:${index + 1}`),
    tenantId,
    typeId: type.id,
    sequence: 0,
    label: index === 0 ? 'Room condition' : 'Plant and life safety',
    description: 'Complete every check and raise action where attention is required.',
  }))
  const inspectionQuestions = [
    ['room-door', 0, 'Entrance and fire door close and latch correctly'],
    ['room-water', 0, 'Water outlets are safe and free from visible leaks'],
    ['room-electrical', 0, 'Sockets, lighting, and appliances appear serviceable'],
    ['room-ready', 0, 'Room presentation meets guest-ready standard'],
    ['plant-fire', 1, 'Fire panel shows normal condition with no unresolved faults'],
    ['plant-water', 1, 'Hot-water temperatures are within the operating range'],
    ['plant-lift', 1, 'Lift alarm communication test is satisfactory'],
    ['plant-access', 1, 'Plant areas are secure, clear, and safely accessible'],
  ] as const
  const inspectionCriteria = inspectionQuestions.map(([key, typeIndex, text], index) => ({
    id: demoId(`inspection-criterion:${key}`),
    tenantId,
    typeId: inspectionTypes[typeIndex]!.id,
    groupId: inspectionGroups[typeIndex]!.id,
    sequence: index % 4,
    text,
    responseType: 'pass_fail_na' as const,
    choiceOptions: [],
    requiresPhoto: false,
    requiresComment: false,
  }))
  const inspectionStatuses = [
    'draft',
    'in_progress',
    'submitted',
    'submitted',
    'closed',
    'closed',
  ] as const
  const inspectionRecords = inspectionStatuses.map((status, index) => ({
    id: demoId(`inspection-record:${index + 1}`),
    tenantId,
    reference: `HOT-INS-${String(index + 1).padStart(4, '0')}`,
    typeId: inspectionTypes[index % 2]!.id,
    status,
    locked: status === 'closed',
    occurredAt: new Date(
      Math.max(
        monthStart.getTime(),
        Math.min(now.getTime() - index * 60_000, monthStart.getTime() + (index + 1) * 3_600_000),
      ),
    ),
    siteOrgUnitId,
    locationOnSite: index % 2 === 0 ? `Room ${roomNumbers[index]!}` : 'Main plant room',
    inspectorTenantUserId: staff[3]!.tenantUserId,
    supervisorTenantUserId: staff[1]!.tenantUserId,
    foremanPersonIds: [],
    customerOrgUnitId,
    notes:
      index === 3
        ? 'Attention required: fire-door closer did not latch.'
        : 'Demo inspection record.',
    submittedAt: ['submitted', 'closed'].includes(status) ? addDays(now, -1) : null,
    submittedByTenantUserId: ['submitted', 'closed'].includes(status)
      ? staff[3]!.tenantUserId
      : null,
    closedAt: status === 'closed' ? now : null,
    closedByTenantUserId: status === 'closed' ? staff[1]!.tenantUserId : null,
    metadata: { propertyId, demoSeedKey: DEMO_HOTEL_SEED_KEY },
  }))
  const correctiveActionStatuses = [
    'open',
    'open',
    'in_progress',
    'in_progress',
    'pending_verification',
    'closed',
  ] as const
  const correctiveActions = correctiveActionStatuses.map((status, index) => ({
    id: demoId(`ca:${index + 1}`),
    tenantId,
    reference: `HOT-CA-${String(index + 1).padStart(4, '0')}`,
    title: [
      'Adjust fire-door closer',
      'Restore hot-water operating temperature',
      'Replace damaged plant-room signage',
      'Investigate recurring fan-coil alarm',
      'Verify repaired lift alarm',
      'Remove corridor trip hazard',
    ][index]!,
    description: 'Deterministic hotel demo corrective action.',
    severity: (['high', 'critical', 'medium', 'high', 'medium', 'low'] as const)[index]!,
    status,
    isDraft: false,
    assignedByTenantUserId: staff[1]!.tenantUserId,
    ownerTenantUserId: staff[3]!.tenantUserId,
    siteOrgUnitId,
    assignedOn: dateOnly(addDays(now, -7)),
    dueOn: index < 2 ? dateOnly(addDays(now, index - 1)) : dateOnly(addDays(now, index + 3)),
    source: index < 2 ? ('inspection' as const) : ('other' as const),
    sourceEntityType: index < 2 ? 'inspection_record' : 'operational_task_occurrence',
    sourceEntityId: index < 2 ? inspectionRecords[index + 2]!.id : occurrences[index]!.id,
    verificationRequired: index >= 4,
    verificationNotes: status === 'closed' ? 'Verified safe and complete.' : null,
    verifiedByTenantUserId: status === 'closed' ? staff[1]!.tenantUserId : null,
    verifiedAt: status === 'closed' ? now : null,
    closedAt: status === 'closed' ? now : null,
    locked: status === 'closed',
    metadata: { propertyId, demoSeedKey: DEMO_HOTEL_SEED_KEY },
  }))
  const recordCriteria = inspectionRecords.flatMap((record, recordIndex) =>
    inspectionCriteria
      .filter((criterion) => criterion.typeId === record.typeId)
      .map((criterion, index) => {
        const failed = recordIndex === 3 && index === 0
        return {
          id: demoId(`record-criterion:${recordIndex + 1}:${index + 1}`),
          tenantId,
          recordId: record.id,
          criterionId: criterion.id,
          questionTextSnapshot: criterion.text,
          groupLabelSnapshot: recordIndex % 2 === 0 ? 'Room condition' : 'Plant and life safety',
          responseType: 'pass_fail_na' as const,
          choiceOptionsSnapshot: [],
          requiresPhoto: false,
          requiresComment: false,
          sequence: index,
          answer: failed ? ('fail' as const) : ('pass' as const),
          answeredAt: record.status === 'draft' ? null : now,
          answeredByTenantUserId: record.status === 'draft' ? null : staff[3]!.tenantUserId,
          severity: failed ? ('high' as const) : null,
          nonComplianceDescription: failed ? 'Door closer failed to latch reliably.' : null,
          actionTaken: null,
          compliantNote: failed ? null : 'Satisfactory.',
          assignedToPersonId: failed ? staff[3]!.personId : null,
          assignedToTenantUserId: failed ? staff[3]!.tenantUserId : null,
          assignedDueDate: failed ? dateOnly(addDays(now, 2)) : null,
          correctedOn: null,
          photoAttachmentIds: [],
          correctiveActionId: failed ? correctiveActions[0]!.id : null,
        }
      }),
  )
  const documents = [
    ['FIRE-SAFETY', 'Fire Safety Policy', 'published', 10],
    ['EMERGENCY-PLAN', 'Emergency Response Plan', 'published', 45],
    ['WATER-HYGIENE', 'Water Hygiene Control Log', 'under_review', -2],
    ['CONTRACTOR-RAMS', 'Contractor RAMS Register', 'published', 20],
  ].map(([key, title, status, reviewOffset], index) => ({
    id: demoId(`document:${index + 1}`),
    tenantId,
    key: key as string,
    title: title as string,
    description: 'Seeded hotel controlled document for demonstration and validation.',
    status: status as 'published' | 'under_review',
    ownerTenantUserId: staff[index % 2]!.tenantUserId,
    reviewFrequencyMonths: 12,
    nextReviewOn: dateOnly(addDays(now, reviewOffset as number)),
  }))
  const documentVersions = documents.map((document, index) => ({
    id: demoId(`document-version:${index + 1}`),
    tenantId,
    documentId: document.id,
    version: 1,
    textContent: `${document.title}\n\nControlled demonstration content for Uvanoo Demo Hotel.`,
    renderStatus: 'complete',
    publishedAt: addDays(now, -90 + index),
    publishedBy: staff[0]!.userId,
    changelog: 'Initial deterministic demo version.',
  }))
  const complianceStates = [
    'completed',
    'completed',
    'pending',
    'expiring',
    'overdue',
    'in_progress',
  ] as const
  const complianceObligations = [
    ...documents.map((document, index) => ({
      id: demoId(`obligation:document:${index + 1}`),
      tenantId,
      sourceModule: 'document' as const,
      subjectKind: 'per_record' as const,
      title: `Review: ${document.title}`,
      notes: 'Hotel document control obligation.',
      status: 'active' as const,
      targetRef: { documentId: document.id },
      recurrence: { kind: 'expiry' as const, remindBeforeDays: 30 },
      recurrenceKind: 'expiry' as const,
      nextDueAt: addDays(now, [60, 30, -2, 20][index]!),
      sourceKey: `demo-hotel-document-${index + 1}`,
      sourceId: document.id,
      createdByTenantUserId: staff[0]!.tenantUserId,
    })),
    ...inspectionTypes.map((type, index) => ({
      id: demoId(`obligation:inspection:${index + 1}`),
      tenantId,
      sourceModule: 'inspection' as const,
      subjectKind: 'per_record' as const,
      title: `Complete: ${type.name}`,
      notes: 'Hotel inspection compliance obligation.',
      status: 'active' as const,
      targetRef: { inspectionTypeId: type.id },
      recurrence: {
        kind: 'frequency' as const,
        frequency: index ? ('week' as const) : ('month' as const),
        quantity: 1,
      },
      recurrenceKind: 'frequency' as const,
      nextDueAt: addDays(now, index ? -1 : 3),
      sourceKey: `demo-hotel-inspection-${index + 1}`,
      sourceId: type.id,
      createdByTenantUserId: staff[1]!.tenantUserId,
    })),
  ]
  const complianceStatuses = complianceStates.map((status, index) => ({
    id: demoId(`compliance-status:${index + 1}`),
    tenantId,
    obligationId: complianceObligations[index]!.id,
    personId: null,
    subjectRef: (index < 4
      ? { documentId: documents[index]!.id }
      : { inspectionTypeId: inspectionTypes[index - 4]!.id }) as Record<string, string>,
    subjectKey: `record:${index < 4 ? documents[index]!.id : inspectionTypes[index - 4]!.id}`,
    periodStart: dateOnly(monthStart),
    periodEnd: dateOnly(addDays(monthStart, 31)),
    dueOn: dateOnly(addDays(now, index - 2)),
    status,
    completedOn: status === 'completed' ? dateOnly(addDays(now, -5)) : null,
    count: status === 'completed' ? 1 : 0,
    expected: 1,
    percent: status === 'completed' ? 100 : 0,
    sourceRef: { propertyId },
    computedAt: now,
  }))
  const equipment = [
    ['FIRE-001', 'Fire alarm control panel', 'in_service'],
    ['LIFT-001', 'Passenger lift controller', 'in_repair'],
    ['BOILER-001', 'Domestic hot-water boiler 1', 'in_service'],
    ['HVAC-001', 'Main air-handling unit', 'in_service'],
    ['GEN-001', 'Emergency standby generator', 'out_of_service'],
  ].map(([assetTag, name, status], index) => ({
    id: demoId(`equipment:${index + 1}`),
    tenantId,
    typeId: demoId('equipment-type'),
    categoryId: demoId('equipment-category'),
    assetTag: assetTag!,
    serialNumber: `DEMO-${1000 + index}`,
    name: name!,
    description: 'Hotel engineering asset.',
    qrToken: demoToken(`equipment:${index + 1}`),
    status: status as 'in_service' | 'in_repair' | 'out_of_service',
    isDraft: false,
    ownership: 'owned' as const,
    warrantyExpiresOn: dateOnly(addDays(now, [-10, 15, 25, 180, 365][index]!)),
    currentSiteOrgUnitId: siteOrgUnitId,
    requiresPreUseInspection: false,
    isMissing: false,
    requiresOilChange: false,
  }))
  const incidents = [
    ['HOT-INC-0001', 'near_miss', 'no_injury', 'reported', 'Wet-floor near miss in lobby', -4],
    [
      'HOT-INC-0002',
      'injury',
      'first_aid_only',
      'under_investigation',
      'Minor kitchen burn treated with first aid',
      -12,
    ],
    [
      'HOT-INC-0003',
      'property_damage',
      'no_injury',
      'closed',
      'Service trolley damaged corridor wall',
      -40,
    ],
  ].map(([reference, type, severity, status, title, days], index) => ({
    id: demoId(`incident:${index + 1}`),
    tenantId,
    reference: reference as string,
    type: type as 'near_miss' | 'injury' | 'property_damage',
    severity: severity as 'no_injury' | 'first_aid_only',
    status: status as 'reported' | 'under_investigation' | 'closed',
    isDraft: false,
    title: title as string,
    description: 'Hotel operations demo incident.',
    occurredAt: addDays(now, days as number),
    reportedAt: addDays(now, days as number),
    siteOrgUnitId,
    location: index === 0 ? 'Lobby' : index === 1 ? 'Kitchen' : 'Third-floor corridor',
    reportedByTenantUserId: staff[2]!.tenantUserId,
    criticalInjury: false,
    ministryOfLabourNotified: false,
    firstAidGiven: index === 1,
    firstAidNotes: index === 1 ? 'Cooled burn and applied sterile dressing.' : null,
    medicalAttentionReceived: false,
    emsCalled: false,
    lostTime: false,
    modifiedDuty: false,
    externallyReportable: false,
    actualSeverity: index === 1 ? 2 : 1,
    potentialSeverity: 2,
    severityRating: index === 1 ? 2 : 1,
    policeNotified: false,
    contributingFactors: [],
    assignedInvestigatorTenantUserId: index === 1 ? staff[2]!.tenantUserId : null,
    inProgress: status !== 'closed',
    locked: status === 'closed',
    closedAt: status === 'closed' ? addDays(now, -35) : null,
    closedByTenantUserId: status === 'closed' ? staff[2]!.tenantUserId : null,
  }))
  const previousWeekStart = addDays(weekStart, -7)
  const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const currentMonthStart = monthStart
  const signoffs = [
    ['weekly', previousWeekStart, weekStart],
    ['weekly', addDays(previousWeekStart, -7), previousWeekStart],
    ['monthly', previousMonthStart, currentMonthStart],
    [
      'monthly',
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)),
      previousMonthStart,
    ],
  ].map(([kind, periodStart, periodEnd], index) => ({
    id: demoId(`signoff:${index + 1}`),
    tenantId,
    propertyId,
    kind: kind as 'weekly' | 'monthly',
    periodStart: periodStart as Date,
    periodEnd: periodEnd as Date,
    summary: {
      total: 8,
      completed: 6,
      overdue: 1,
      incomplete: 2,
      demoSeedKey: DEMO_HOTEL_SEED_KEY,
    },
    comments: 'Reviewed by management; outstanding items assigned and tracked.',
    confirmedAt: new Date((periodEnd as Date).getTime() + 3_600_000),
    confirmedByTenantUserId: staff[0]!.tenantUserId,
  }))

  const expected = {
    tenants: 1,
    properties: 1,
    buildings: 1,
    floors: 5,
    rooms: 33,
    roomQrTargets: 33,
    users: 5,
    activePeople: 8,
    contractors: 3,
    roles: 5,
    moduleEntitlements: 5,
    roomsByStatus: countBy(rooms, (row) => row.status),
    maintenanceIssues: 12,
    maintenanceByStatus: countBy(maintenanceIssues, (row) => row.status),
    maintenanceByPriority: countBy(maintenanceIssues, (row) => row.priority),
    maintenanceBySource: countBy(maintenanceIssues, (row) => row.source),
    workOrders: 8,
    taskTemplates: 8,
    taskSchedules: 8,
    taskOccurrences: 12,
    tasksByStatus: countBy(occurrences, (row) => row.status),
    currentPeriodTasks: { total: 8, completed: 4, overdue: 2, incomplete: 4 },
    historicalSignoffs: 4,
    currentSignoffsAwaiting: 2,
    inspectionTypes: 2,
    inspectionRecords: 6,
    inspectionsByStatus: countBy(inspectionRecords, (row) => row.status),
    failedInspectionCriteria: 1,
    correctiveActions: 6,
    correctiveActionsByStatus: countBy(correctiveActions, (row) => row.status),
    documents: 4,
    complianceStatuses: 6,
    complianceByStatus: countBy(complianceStatuses, (row) => row.status),
    equipmentAssets: 5,
    equipmentWarrantyExpired: 1,
    equipmentWarrantyDueWithin30Days: 2,
    incidents: 3,
    dashboard: {
      incidentsLast30Days: 2,
      incidentsPrior30Days: 1,
      openCorrectiveActions: 5,
      overdueCorrectiveActions: 2,
      inspectionsThisMonth: 4,
      activePeople: 8,
      documentComplianceCompleted: 2,
      documentComplianceTotal: 4,
      documentCompliancePercent: 50,
      formSubmissionsToday: 0,
      expiringTrainingCertificates: 0,
      ppeIssues: 0,
    },
  }

  return {
    now,
    tenantId,
    propertyId,
    buildingId,
    customerOrgUnitId,
    siteOrgUnitId,
    floors,
    rooms,
    qrTargets,
    staff,
    contractors,
    roles,
    maintenanceIssues,
    workOrders,
    taskTemplates,
    taskSchedules,
    occurrences,
    lifecycleEvents,
    inspectionTypes,
    inspectionGroups,
    inspectionCriteria,
    inspectionRecords,
    recordCriteria,
    correctiveActions,
    documents,
    documentVersions,
    complianceObligations,
    complianceStatuses,
    equipment,
    incidents,
    signoffs,
    expected,
  }
}

export type DemoHotelSeedPlan = ReturnType<typeof buildDemoHotelSeedPlan>

import { describe, expect, it } from 'vitest'
import {
  assertCycasSeedEnvironment,
  buildCycasDemoSeedPlan,
  cycasId,
  findCycasDemoIdentityCollisions,
  getCycasDemoAccounts,
} from './cycas-demo-seed-plan'

const anchor = new Date('2026-09-17T12:00:00.000Z')

describe('Cycas Hospitality portfolio seed plan', () => {
  it('is deterministic and models the management company above exactly two hotels', () => {
    const first = buildCycasDemoSeedPlan(anchor)
    expect(buildCycasDemoSeedPlan(anchor)).toEqual(first)
    expect(first.tenantId).toBe(cycasId('tenant'))
    expect(first.managementCompany.name).toBe('Cycas Hospitality')
    expect(first.properties.map((property) => property.name)).toEqual([
      'One Fifty Fenchurch',
      'The Lincoln Suites',
    ])
    expect(first.properties).toHaveLength(2)
    expect(first.properties.some((property) => property.name === 'Cycas Hospitality')).toBe(false)
  })

  it('gives one Cluster GM both properties and each hotel manager only their hotel', () => {
    const plan = buildCycasDemoSeedPlan(anchor)
    const assignmentFor = (key: string) => {
      const member = plan.staff.find((candidate) => candidate.key === key)!
      return plan.roleAssignments.find(
        (assignment) => assignment.tenantUserId === member.tenantUserId,
      )!.scope.propertyIds
    }
    expect(new Set(assignmentFor('cluster-gm'))).toEqual(
      new Set(plan.properties.map((property) => property.id)),
    )
    expect(assignmentFor('fenchurch-manager')).toEqual([plan.properties[0]!.id])
    expect(assignmentFor('lincoln-manager')).toEqual([plan.properties[1]!.id])
    expect(plan.staff.filter((member) => member.key === 'cluster-gm')).toHaveLength(1)
  })

  it('uses a deterministic Cycas-only namespace with no internal or Demo Hotel collisions', () => {
    const plan = buildCycasDemoSeedPlan(anchor)
    const accounts = getCycasDemoAccounts(plan)
    const contractors = [...plan.hotels.fenchurch.contractors, ...plan.hotels.lincoln.contractors]
    const allPeopleEmails = [...accounts, ...contractors].map((identity) => identity.email)
    expect(accounts).toHaveLength(19)
    expect(contractors).toHaveLength(6)
    expect(new Set(allPeopleEmails).size).toBe(allPeopleEmails.length)
    expect(allPeopleEmails.every((email) => email.endsWith('@cycas.demo.uvanoo.invalid'))).toBe(
      true,
    )
    expect(allPeopleEmails).not.toContain('gm@demo.uvanoo.invalid')
    const existingDemoHotelAccounts = ['gm', 'maintenance', 'duty', 'engineer', 'front-office'].map(
      (key) => ({ email: `${key}@demo.uvanoo.invalid`, userId: `existing-${key}` }),
    )
    expect(findCycasDemoIdentityCollisions(accounts, existingDemoHotelAccounts)).toEqual([])
    expect(
      findCycasDemoIdentityCollisions(accounts, [
        { email: accounts[0]!.email, userId: 'not-the-seed-owned-id' },
      ]),
    ).toEqual([{ email: accounts[0]!.email, userId: 'not-the-seed-owned-id' }])
  })

  it('keeps room codes tenant-unique and every room QR target referentially valid', () => {
    const plan = buildCycasDemoSeedPlan(anchor)
    const hotels = Object.values(plan.hotels)
    const rooms = hotels.flatMap((hotel) => hotel.rooms)
    const roomKeys = new Set(rooms.map((room) => `${room.tenantId}:${room.id}`))
    expect(new Set(rooms.map((room) => `${room.tenantId}:${room.code}`)).size).toBe(rooms.length)
    const expectTenantUnique = (values: { tenantId: string; value: string }[]) =>
      expect(new Set(values.map(({ tenantId, value }) => `${tenantId}:${value}`)).size).toBe(
        values.length,
      )
    expectTenantUnique(
      hotels.flatMap((hotel) =>
        hotel.maintenanceIssues.map((issue) => ({
          tenantId: issue.tenantId,
          value: issue.reference,
        })),
      ),
    )
    expectTenantUnique(
      hotels.flatMap((hotel) =>
        hotel.workOrders.map((order) => ({
          tenantId: order.tenantId,
          value: order.reference,
        })),
      ),
    )
    expectTenantUnique(
      hotels.flatMap((hotel) =>
        hotel.equipment.map((item) => ({ tenantId: item.tenantId, value: item.assetTag })),
      ),
    )
    expectTenantUnique(
      hotels.flatMap((hotel) =>
        hotel.inspectionTypes.map((type) => ({ tenantId: type.tenantId, value: type.name })),
      ),
    )
    expectTenantUnique(
      hotels.flatMap((hotel) =>
        hotel.inspectionRecords.map((record) => ({
          tenantId: record.tenantId,
          value: record.reference,
        })),
      ),
    )
    expectTenantUnique(
      hotels.flatMap((hotel) =>
        hotel.documents.map((document) => ({
          tenantId: document.tenantId,
          value: document.key.toLowerCase(),
        })),
      ),
    )
    for (const hotel of hotels) {
      expect(hotel.qrTargets).toHaveLength(hotel.rooms.length)
      for (const target of hotel.qrTargets)
        expect(roomKeys.has(`${target.tenantId}:${target.roomId}`)).toBe(true)
    }
  })

  it('contains meaningful, varied operations and H&S registry records for both hotels', () => {
    const plan = buildCycasDemoSeedPlan(anchor)
    expect(plan.expected.rooms).toEqual({ fenchurch: 33, lincoln: 54 })
    expect(plan.expected.maintenanceIssues).toEqual({ fenchurch: 12, lincoln: 12 })
    expect(plan.expected.operationalRecords).toEqual({ fenchurch: 21, lincoln: 21 })
    expect(plan.expected.users).toBe(19)
    expect(plan.expected.complianceRegistry).toEqual({ fenchurch: 22, lincoln: 22 })
    for (const property of plan.properties) {
      const records = plan.registry.filter((record) => record.propertyId === property.id)
      expect(records).toHaveLength(22)
      expect(new Set(records.map((record) => record.status)).size).toBeGreaterThanOrEqual(4)
      expect(records.some((record) => record.status === 'overdue')).toBe(true)
      expect(records.every((record) => record.evidenceDocumentId)).toBe(true)
    }
  })
})

describe('Cycas seed safety guard', () => {
  it('rejects implicit and production targets', () => {
    expect(() => assertCycasSeedEnvironment({})).toThrow(/TARGET/)
    expect(() =>
      assertCycasSeedEnvironment({
        UVANOO_CYCAS_SEED_TARGET: 'production',
        UVANOO_CYCAS_SEED_CONFIRM: 'SEED_CYCAS_HOSPITALITY_PRODUCTION',
        SUPERADMIN_DATABASE_URL: 'postgres://user:pass@prod/uvanoo_production',
      }),
    ).toThrow(/TARGET/)
  })

  it('accepts an explicitly confirmed local development database', () => {
    expect(() =>
      assertCycasSeedEnvironment({
        UVANOO_CYCAS_SEED_TARGET: 'development',
        UVANOO_CYCAS_SEED_CONFIRM: 'SEED_CYCAS_HOSPITALITY_DEVELOPMENT',
        NODE_ENV: 'development',
        SUPERADMIN_DATABASE_URL: 'postgres://user:pass@localhost/beaconhs',
      }),
    ).not.toThrow()
  })
})

describe('Board acceptance plan', () => {
  it('uses the frozen Board anchor, 87 room keys and immediate property assignments', () => {
    const plan = buildCycasDemoSeedPlan()
    expect(plan.now.toISOString()).toBe('2026-10-15T12:00:00.000Z')
    expect(plan.hotels.lincoln.floors).toHaveLength(5)
    expect(
      plan.hotels.lincoln.floors.map(
        (floor) => plan.hotels.lincoln.rooms.filter((room) => room.floorId === floor.id).length,
      ),
    ).toEqual([10, 11, 11, 11, 11])
    expect(new Set(plan.staff.map((member) => member.key)).size).toBe(19)
    expect(new Set(plan.staff.map((member) => member.userId)).size).toBe(19)
    expect(plan.staff.every((member) => member.propertyIds.length > 0)).toBe(true)
    const safety = plan.staff.find((member) => member.key === 'safety-compliance')!
    expect(safety.propertyIds).toHaveLength(2)
    expect(plan.roles.find((role) => role.key === 'safety')!.permissions).toContain(
      'compliance.read',
    )
    expect(
      plan.roles
        .find((role) => role.key === 'restricted')!
        .permissions.every((permission) => permission.endsWith('.read')),
    ).toBe(true)
  })

  it('refuses staging and unspecified runtime environments', () => {
    for (const runtime of [undefined, 'staging', 'production']) {
      expect(() =>
        assertCycasSeedEnvironment({
          UVANOO_CYCAS_SEED_TARGET: 'development',
          UVANOO_CYCAS_SEED_CONFIRM: 'SEED_CYCAS_HOSPITALITY_DEVELOPMENT',
          SUPERADMIN_DATABASE_URL: 'postgres://user@localhost/beaconhs_test',
          NODE_ENV: runtime,
        }),
      ).toThrow()
    }
    expect(() =>
      assertCycasSeedEnvironment({
        UVANOO_CYCAS_SEED_TARGET: 'staging',
        UVANOO_CYCAS_SEED_CONFIRM: 'SEED_CYCAS_HOSPITALITY_STAGING',
        SUPERADMIN_DATABASE_URL: 'postgres://user@localhost/uvanoo_staging',
        NODE_ENV: 'development',
      }),
    ).toThrow()
  })
})

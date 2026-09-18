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
    expect(accounts).toHaveLength(18)
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

  it('contains meaningful, varied operations and H&S registry records for both hotels', () => {
    const plan = buildCycasDemoSeedPlan(anchor)
    expect(plan.expected.rooms).toEqual({ fenchurch: 33, lincoln: 33 })
    expect(plan.expected.maintenanceIssues).toEqual({ fenchurch: 12, lincoln: 12 })
    expect(plan.expected.operationalRecords).toEqual({ fenchurch: 21, lincoln: 21 })
    expect(plan.expected.users).toBe(18)
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

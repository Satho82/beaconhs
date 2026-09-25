import { describe, expect, it } from 'vitest'
import {
  assertDemoHotelSeedEnvironment,
  buildDemoHotelSeedPlan,
  demoId,
} from './demo-hotel-seed-plan'

const anchor = new Date('2026-09-16T12:00:00.000Z')

describe('Uvanoo Demo Hotel seed plan', () => {
  it('builds the exact deterministic hotel topology', () => {
    const first = buildDemoHotelSeedPlan(anchor)
    const second = buildDemoHotelSeedPlan(anchor)

    expect(second).toEqual(first)
    expect(first.tenantId).toBe(demoId('tenant'))
    expect(first.floors).toHaveLength(5)
    expect(first.rooms).toHaveLength(33)
    expect(new Set(first.rooms.map((room) => room.code))).toHaveLength(33)
    expect(first.qrTargets).toHaveLength(33)
    expect(new Set(first.qrTargets.map((target) => target.token))).toHaveLength(33)
    expect(first.qrTargets.every((target) => /^[A-Za-z0-9_-]{43}$/.test(target.token))).toBe(true)
    expect(first.expected.roomsByStatus).toEqual({
      occupied: 4,
      maintenance: 2,
      blocked: 1,
      out_of_service: 1,
      available: 25,
    })
  })

  it('covers operational states and reconciles dashboard counts', () => {
    const { expected } = buildDemoHotelSeedPlan(anchor)
    expect(expected.maintenanceByStatus).toEqual({
      reported: 2,
      acknowledged: 1,
      assigned: 2,
      in_progress: 2,
      awaiting_parts: 1,
      completed: 2,
      closed: 1,
      cancelled: 1,
    })
    expect(expected.maintenanceByPriority).toEqual({ high: 4, medium: 5, low: 2, critical: 1 })
    expect(expected.tasksByStatus).toEqual({
      completed: 4,
      overdue: 1,
      escalated: 1,
      in_progress: 1,
      open: 3,
      waived: 1,
      cancelled: 1,
    })
    expect(expected.inspectionsByStatus).toEqual({
      draft: 1,
      in_progress: 1,
      submitted: 2,
      closed: 2,
    })
    expect(expected.correctiveActionsByStatus).toEqual({
      open: 2,
      in_progress: 2,
      pending_verification: 1,
      closed: 1,
    })
    expect(expected.complianceByStatus).toEqual({
      completed: 2,
      pending: 1,
      expiring: 1,
      overdue: 1,
      in_progress: 1,
    })
    expect(expected.dashboard).toEqual({
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
    })
  })
})
describe('Uvanoo Demo Hotel seed safety guard', () => {
  it('rejects absent, production, and mismatched targets', () => {
    expect(() => assertDemoHotelSeedEnvironment({})).toThrow(/TARGET/)
    expect(() =>
      assertDemoHotelSeedEnvironment({
        UVANOO_DEMO_SEED_TARGET: 'production',
        UVANOO_DEMO_SEED_CONFIRM: 'SEED_UVANOO_DEMO_HOTEL_PRODUCTION',
        SUPERADMIN_DATABASE_URL: 'postgres://user:pass@prod/db',
      }),
    ).toThrow(/TARGET/)
    expect(() =>
      assertDemoHotelSeedEnvironment({
        UVANOO_DEMO_SEED_TARGET: 'staging',
        UVANOO_DEMO_SEED_CONFIRM: 'SEED_UVANOO_DEMO_HOTEL_STAGING',
        SENTRY_ENVIRONMENT: 'production',
        SUPERADMIN_DATABASE_URL: 'postgres://user:pass@host/uvanoo_production',
      }),
    ).toThrow(/uvanoo_staging/)
    expect(() =>
      assertDemoHotelSeedEnvironment({
        UVANOO_DEMO_SEED_TARGET: 'development',
        UVANOO_DEMO_SEED_CONFIRM: 'wrong',
        SUPERADMIN_DATABASE_URL: 'postgres://user:pass@localhost/beaconhs',
      }),
    ).toThrow(/CONFIRM/)
  })

  it('accepts only explicit development and staging configurations', () => {
    expect(() =>
      assertDemoHotelSeedEnvironment({
        UVANOO_DEMO_SEED_TARGET: 'development',
        UVANOO_DEMO_SEED_CONFIRM: 'SEED_UVANOO_DEMO_HOTEL_DEVELOPMENT',
        NODE_ENV: 'development',
        SUPERADMIN_DATABASE_URL: 'postgres://user:pass@localhost/beaconhs',
      }),
    ).not.toThrow()
    expect(() =>
      assertDemoHotelSeedEnvironment({
        UVANOO_DEMO_SEED_TARGET: 'staging',
        UVANOO_DEMO_SEED_CONFIRM: 'SEED_UVANOO_DEMO_HOTEL_STAGING',
        NODE_ENV: 'production',
        SENTRY_ENVIRONMENT: 'staging',
        SUPERADMIN_DATABASE_URL: 'postgres://user:pass@staging-db/uvanoo_staging',
      }),
    ).not.toThrow()
  })
})

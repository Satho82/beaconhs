import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'bullmq'
import type { PushJobData } from '@beaconhs/jobs'

const mocks = vi.hoisted(() => ({
  entitled: vi.fn(),
  select: vi.fn(),
  send: vi.fn(),
}))
vi.mock('@beaconhs/db', () => ({
  db: {},
  isTenantModuleEntitled: mocks.entitled,
  withTenant: async (_db: unknown, _tenantId: string, run: (tx: unknown) => unknown) =>
    run({ select: mocks.select }),
}))
vi.mock('@beaconhs/jobs', () => ({
  assertPushJobData: vi.fn(),
  validateWebPushSubscription: (value: unknown) => value,
  sendWebPushNotification: mocks.send,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VAPID_PUBLIC_KEY', 'test-public')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private')
  mocks.entitled.mockResolvedValue(false)
  mocks.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => [] }) }),
  })
})

function job(overrides: Partial<PushJobData>): Job<PushJobData> {
  return {
    data: {
      tenantId: 'tenant-1',
      userId: 'user-1',
      subscriptionId: 'sub-1',
      title: 'Due',
      ...overrides,
    },
  } as Job<PushJobData>
}

describe('queued push Compliance entitlement', () => {
  it.each(['/training/learn/course-1', '/documents/doc-1', '/compliance/mine'])(
    'suppresses a marked Compliance push linking to %s after revocation',
    async (linkPath) => {
      const { processPush } = await import('./push')
      await processPush(job({ linkPath, requiresComplianceEntitlement: true }))
      expect(mocks.entitled).toHaveBeenCalledWith(
        expect.anything(),
        'tenant-1',
        'hospitality.compliance',
      )
      expect(mocks.select).not.toHaveBeenCalled()
      expect(mocks.send).not.toHaveBeenCalled()
    },
  )
  it('retains the legacy Compliance-route revocation check', async () => {
    const { processPush } = await import('./push')
    await processPush(job({ linkPath: '/compliance/mine' }))
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('does not block unrelated Training notifications', async () => {
    const { processPush } = await import('./push')
    await processPush(job({ linkPath: '/training/learn/course-1' }))
    expect(mocks.entitled).not.toHaveBeenCalled()
    expect(mocks.select).toHaveBeenCalledOnce()
  })
  it('continues subscription authorization for an entitled Compliance push', async () => {
    mocks.entitled.mockResolvedValue(true)
    const { processPush } = await import('./push')
    await processPush(
      job({ linkPath: '/training/learn/course-1', requiresComplianceEntitlement: true }),
    )
    expect(mocks.select).toHaveBeenCalledOnce()
  })
})

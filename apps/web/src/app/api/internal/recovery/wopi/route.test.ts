import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ context: vi.fn(), config: vi.fn(), status: vi.fn() }))
vi.mock('@beaconhs/auth', () => ({ getReadOnlyPlatformOperator: mocks.context }))
vi.mock('@/lib/wopi-save-state', () => ({ recoveryConfig: mocks.config }))
vi.mock('@/lib/wopi-save-telemetry', () => ({ saveStatus: mocks.status }))
import { GET as handler } from './route'
const GET = () => handler(new Request('https://dev.uvanoo.com/api/internal/recovery/wopi'))

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('UVANOO_RECOVERY_READERS', 'approved')
  mocks.config.mockReturnValue({ epoch: 'bound' })
  mocks.context.mockResolvedValue('approved')
  mocks.status.mockResolvedValue({ inFlight: 0, drainageProven: false })
})
it('returns aggregate no-store evidence to an approved platform admin', async () => {
  const response = await GET()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(await response.json()).toEqual({ inFlight: 0, drainageProven: false })
})
it.each([null, 'other'])(
  'rejects unauthorized readers before any ledger query: %j',
  async (context) => {
    mocks.context.mockResolvedValue(context)
    expect((await GET()).status).toBe(403)
    expect(mocks.status).not.toHaveBeenCalled()
  },
)
it('hides the route outside the exact enabled deployment', async () => {
  mocks.config.mockReturnValue(null)
  expect((await GET()).status).toBe(404)
  expect(mocks.context).not.toHaveBeenCalled()
})
it('fails closed without returning database errors', async () => {
  mocks.status.mockRejectedValue(new Error('private details'))
  const response = await GET()
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ status: 'UNKNOWN' })
})

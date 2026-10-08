import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  guard: vi.fn(),
  query: vi.fn(),
  read: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.context }))
vi.mock('@beaconhs/db/schema', () => ({ tenants: { id: 'tenant-id' } }))
vi.mock('drizzle-orm', () => ({ eq: (column: unknown, value: unknown) => ({ column, value }) }))
vi.mock('@/lib/tenant-brand-assets', () => ({ readTenantBrandAsset: mocks.read }))
import { GET } from './route'

const tenantId = '11111111-1111-4111-8111-111111111111'
const assetId = '22222222-2222-4222-8222-222222222222'
const key = `tenants/${tenantId}/branding/logo/${assetId}.png`
beforeEach(() => {
  vi.resetAllMocks()
  mocks.context.mockResolvedValue({
    tenantId,
    db: (fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from: () => ({ where: (filter: unknown) => ({ limit: () => mocks.query(filter) }) }),
        }),
      }),
  })
  mocks.query.mockResolvedValue([{ branding: { logoUrl: key } }])
  mocks.read.mockResolvedValue(new Uint8Array([1, 2, 3]))
})
it('rejects unauthorized access before privileged reads', async () => {
  mocks.context.mockRejectedValue(new Error('Forbidden'))
  await expect(GET()).rejects.toThrow('Forbidden')
  expect(mocks.query).not.toHaveBeenCalled()
  expect(mocks.read).not.toHaveBeenCalled()
})
it('uses the authenticated tenant, private caching and nosniff', async () => {
  const response = await GET()
  expect(response.status).toBe(200)
  expect(mocks.query).toHaveBeenCalledWith({ column: 'tenant-id', value: tenantId })
  expect(mocks.read).toHaveBeenCalledWith(tenantId, 'logo', key)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
})
it.each([
  key.replace(tenantId, assetId),
  key.replace('/logo/', '/letterhead/'),
  'https://external.example/asset.png',
])('refuses cross-tenant, wrong-kind and external keys: %s', async (logoUrl) => {
  mocks.query.mockResolvedValue([{ branding: { logoUrl } }])
  expect((await GET()).status).toBe(404)
  expect(mocks.read).not.toHaveBeenCalled()
})

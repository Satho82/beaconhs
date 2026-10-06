import { Children, isValidElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), entitlement: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.auth }))
vi.mock('@/lib/module-entitlements/server', () => ({
  assertTenantModuleEntitled: mocks.entitlement,
}))
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedTranslations: async () => (key: string) => key,
  getGeneratedValueTranslations: async () => (value: string) => value,
}))
vi.mock('@/components/page-layout', () => ({ PageContainer: 'main' }))
vi.mock('@/components/photo-uploader-section', () => ({ PhotoUploaderSection: 'uploader' }))
vi.mock('@/components/raw-image', () => ({ RawImage: 'image' }))
vi.mock('@beaconhs/ui', () => ({
  Badge: 'badge',
  Button: 'button',
  Label: 'label',
  PageHeader: 'header',
  Select: 'select',
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('404')
  },
}))
vi.mock('@/app/(app)/hospitality/properties/actions', () => ({
  updateMaintenanceIssueAction: vi.fn(),
}))
vi.mock('@/app/(app)/hospitality/maintenance/[issueId]/actions', () => ({
  attachMaintenanceEvidenceAction: vi.fn(),
}))
import IssuePage from '@/app/(app)/hospitality/maintenance/[issueId]/page'
const id = '20000000-0000-4000-8000-000000000001'
const tenant = '10000000-0000-4000-8000-000000000001'
function text(value: ReactNode): string {
  return Children.toArray(value)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child),
    )
    .join(' ')
}
function fixture(visible = true) {
  const queries: { sql: string; params: unknown[] }[] = []
  const dialect = new PgDialect()
  const tx = {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const rows =
          getTableName(table) === 'maintenance_issues'
            ? visible
              ? [
                  {
                    issue: {
                      id,
                      reference: 'M-1',
                      summary: 'Tap repair',
                      priority: 'high',
                      status: 'closed',
                      source: 'staff',
                      assignedToTenantUserId: 'member-1',
                      resolutionNotes: 'Valve replaced',
                      createdAt: new Date('2026-10-01'),
                      updatedAt: new Date('2026-10-02'),
                      completedAt: new Date('2026-10-02'),
                    },
                    propertyName: 'Hotel',
                    roomCode: '101',
                    roomName: null,
                  },
                ]
              : []
            : getTableName(table) === 'tenant_users'
              ? [{ id: 'member-1', name: 'Engineer', email: 'engineer@example.test' }]
              : []
        const builder = {
          innerJoin: () => builder,
          where: (sql: SQL) => {
            queries.push(dialect.sqlToQuery(sql))
            return builder
          },
          limit: async () => rows,
          orderBy: async () => rows,
        }
        return builder
      },
    }),
  }
  const ctx = {
    tenantId: tenant,
    isSuperAdmin: false,
    scopes: [{ type: 'tenant' }],
    permissions: new Set(['maintenance.read']),
    db: vi.fn(async (run: (tx: unknown) => unknown) => run(tx)),
  }
  mocks.auth.mockResolvedValue(ctx)
  return { ctx, queries }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.entitlement.mockResolvedValue(undefined)
})
const page = (issueId = id) => IssuePage({ params: Promise.resolve({ issueId }) })
describe('maintenance Board detail', () => {
  it('shows real assignee, resolution and record history to read-only users', async () => {
    fixture()
    const rendered = text(await page())
    expect(rendered).toContain('Engineer')
    expect(rendered).toContain('Valve replaced')
    expect(rendered).toContain('Resolution and record history')
    expect(rendered).toContain('Completed')
    expect(rendered).not.toContain('Update work')
  })
  it('validates UUID and denies disabled or unreadable maintenance before data access', async () => {
    const f = fixture()
    await expect(page('invalid')).rejects.toThrow('404')
    mocks.entitlement.mockRejectedValueOnce(new Error('disabled'))
    await expect(page()).rejects.toThrow('disabled')
    f.ctx.permissions.clear()
    await expect(page()).rejects.toThrow()
    expect(f.ctx.db).not.toHaveBeenCalled()
  })
  it('retains tenant and issue restrictions and does not render missing issues', async () => {
    const f = fixture(false)
    await expect(page()).rejects.toThrow('404')
    expect(f.queries[0]?.params).toEqual([tenant, id])
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

describe('V1.3.1 staging-hotfix contracts', () => {
  it('keeps the confirmation root deterministic while React hydrates', () => {
    const source = read('lib/confirm.tsx')
    expect(source).toContain("import { useHydrated } from '@/lib/use-hydrated'")
    expect(source).toContain('if (!hydrated) return null')
    expect(source).toContain('() => null')
  })

  it('counts only active hospitality properties on the platform overview', () => {
    const source = read('app/(platform)/platform/tenants/[tenantId]/page.tsx')
    expect(source).toContain('.from(hospitalityProperties)')
    expect(source).toContain('isNull(hospitalityProperties.deletedAt)')
    expect(source).not.toContain("eq(orgUnits.level, 'site')")
  })

  it('keeps property edit localized and protects archive lifecycle from live memberships', () => {
    const page = read('app/(platform)/platform/tenants/[tenantId]/properties/page.tsx')
    const actions = read('app/(platform)/platform/tenants/[tenantId]/_actions.ts')
    expect(page).toContain('const editId = pickString(requested.edit)')
    expect(page).toContain('name="propertyId"')
    expect(page).toContain("tGenerated('m_1ab9025ed1067c')")
    expect(page).toContain("tGenerated('m_03a66f9d34ac7b')")
    expect(actions).toContain('requirePlatformOperator()')
    expect(actions).toContain('eq(hospitalityProperties.tenantId, tenantId)')
    expect(actions).toContain("sql`${roleAssignments.scope}->'propertyIds' ? ${propertyId}`")
    expect(actions).toContain(
      "translateSystemCopy(locale, 'Reassign memberships before archiving this property.')",
    )
    expect(actions).toContain('action: result.action')
    expect(actions).toContain("action: archived ? 'property.archive' : 'property.restore'")
  })
})

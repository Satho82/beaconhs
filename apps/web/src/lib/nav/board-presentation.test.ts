import { describe, expect, it } from 'vitest'
import { boardNavigation } from './board-presentation'
import { buildDefaultNavConfig } from './registry'
import { findActiveNavHref } from '@/components/sidebar-nav-active'
const item = (href: string) => ({ href, label: href, iconKey: 'grid' })
describe('board navigation presentation', () => {
  it('never introduces a route removed by authorization', () => {
    expect(
      boardNavigation([{ label: 'Old', items: [item('/dashboard')] }])
        .flatMap((g) => g.items)
        .map((i) => i.href),
    ).toEqual(['/dashboard'])
  })
  it('consolidates Properties and suppresses legacy primary links without mutating saved input', () => {
    const groups = [
      {
        label: 'Assets & people',
        items: [
          '/hospitality/properties',
          '/locations',
          '/tools',
          '/ppe',
          '/hospitality/maintenance',
        ].map(item),
      },
    ]
    const before = structuredClone(groups)
    const result = boardNavigation(groups)
    expect(result.map((g) => g.label)).toEqual(['Properties', 'Operations'])
    expect(result[0]?.items[0]?.label).toBe('Properties')
    expect(groups).toEqual(before)
  })
  it('retains Toolbox Talk and custom destinations', () => {
    const groups = boardNavigation([
      { label: 'My group', items: [item('/apps/templates/toolbox/records'), item('/custom')] },
    ])
    expect(groups.flatMap((g) => g.items).map((i) => i.href)).toEqual([
      '/apps/templates/toolbox/records',
      '/custom',
    ])
  })
  it('does not add suppressed modules to new default preferences', () => {
    const keys = buildDefaultNavConfig()
      .groups.flatMap((g) => g.items)
      .map((i) => (i.kind === 'module' ? i.moduleKey : ''))
    expect(keys).not.toContain('ppe')
    expect(keys).not.toContain('tools')
    expect(keys).not.toContain('locations')
  })
  it('resolves the most specific nested active link', () => {
    expect(
      findActiveNavHref('/platform/sms/log', [
        { items: [{ ...item('/platform/email'), children: [item('/platform/sms')] }] },
      ]),
    ).toBe('/platform/sms')
    expect(
      findActiveNavHref('/platform/sms-other', [{ items: [item('/platform/sms')] }]),
    ).toBeNull()
  })
})

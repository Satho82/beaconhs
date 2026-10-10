import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { RISK_CATALOGUE_TEMPLATES, SLIPS_TRIPS_TEMPLATE, type Database } from '@beaconhs/db'
import type { RequestContext } from '@beaconhs/tenant'
import { riskTemplates, riskAssessments } from '@beaconhs/db/schema'
import { buildRiskTemplateSnapshot, templateHazardsToInput } from './risk-assessments'
import { saveTenantRiskTemplate } from './risk-tenant-templates'
import { getNewerRiskTemplate } from './risk-lifecycle'
import { canonicalRiskMatrixSnapshot } from '@beaconhs/db/risk-matrix'

const audit = vi.hoisted(() => vi.fn())
vi.mock('@/lib/audit', () => ({ recordAuditInTransaction: audit }))
const A = '10000000-0000-4000-8000-000000000001'
const B = '10000000-0000-4000-8000-000000000002'
const PLATFORM = '00000000-0000-0000-0000-000000000000'
const PROPERTY = '20000000-0000-4000-8000-000000000001'
type Table = Parameters<typeof getTableName>[0]
type Row = Record<string, unknown>

function fixture() {
  let rows: Record<string, Row[]> = {
    risk_templates: [
      {
        ...structuredClone(SLIPS_TRIPS_TEMPLATE),
        id: 'master',
        tenantId: null,
        ownerKey: PLATFORM,
        deletedAt: null,
      },
      {
        ...structuredClone(SLIPS_TRIPS_TEMPLATE),
        id: 'foreign-template',
        tenantId: B,
        ownerKey: B,
        scope: 'tenant',
        deletedAt: null,
      },
    ],
    risk_assessments: [
      {
        id: 'assessment-a',
        tenantId: A,
        propertyId: PROPERTY,
        deletedAt: null,
        areaLocation: 'Synthetic reception',
        activityEquipment: 'Synthetic activity',
        assessmentCategory: 'general',
        matrixSnapshot: canonicalRiskMatrixSnapshot(),
        adoptedTemplateSnapshot: {
          category: 'general',
          reviewGuidance: 'Review when circumstances change.',
        },
      },
      { id: 'assessment-b', tenantId: B, propertyId: 'other-property', deletedAt: null },
    ],
    risk_hazards: [
      {
        id: 'saved-hazard-a',
        tenantId: A,
        assessmentId: 'assessment-a',
        sortOrder: 0,
        hazardDescription: 'Amended synthetic hazard',
        harmDescription: 'Synthetic harm',
        peopleAtRisk: ['Employees'],
        controls: 'Property-amended control',
        additionalControls: 'Arrange additional training',
        initialLikelihood: 3,
        initialSeverity: 4,
        residualLikelihood: 1,
        residualSeverity: 2,
      },
      {
        id: 'saved-hazard-b',
        tenantId: B,
        assessmentId: 'assessment-b',
        sortOrder: 0,
        hazardDescription: 'Private B content',
      },
    ],
  }
  const locks: string[] = []
  const dialect = new PgDialect()
  const tx = {
    select: () => ({
      from: (table: Table) => ({
        where: (condition: SQL) => {
          const query = dialect.sqlToQuery(condition)
          const name = getTableName(table)
          const selected = (rows[name] ?? []).filter((row) => {
            if (name === 'risk_templates') {
              expect(query.sql).toContain('"tenant_id" is null')
              expect(query.sql).toContain('"tenant_id" =')
              return (
                row.id === query.params[0] &&
                (row.tenantId === null || row.tenantId === query.params[1]) &&
                row.state === 'active' &&
                !row.deletedAt
              )
            }
            expect(query.sql).toContain('"tenant_id" =')
            if (name === 'risk_hazards') {
              expect(locks).toContain('risk_assessments')
              return row.tenantId === query.params[0] && row.assessmentId === query.params[1]
            }
            return row.tenantId === query.params[0] && row.id === query.params[1] && !row.deletedAt
          })
          return {
            limit: () =>
              Object.assign(Promise.resolve(structuredClone(selected)), {
                for: async (mode: string) => {
                  expect(mode).toBe('share')
                  locks.push(name)
                  return structuredClone(selected)
                },
              }),
            orderBy: async () => structuredClone(selected),
          }
        },
      }),
    }),
    insert: (table: Table) => ({
      values: (value: Row) => ({
        returning: async () => {
          expect(getTableName(table)).toBe('risk_template_families')
          const families = (rows.risk_template_families ??= [])
          const row = { ...value, id: 'new-family-' + families.length }
          families.push(row)
          return [row]
        },
        onConflictDoNothing: () => ({
          returning: async () => {
            expect(getTableName(table)).toBe('risk_templates')
            expect(value).toMatchObject({
              tenantId: A,
              ownerKey: A,
              scope: 'tenant',
              version: '1.0',
              state: 'draft',
            })
            if (
              rows.risk_templates!.some(
                (row) =>
                  row.tenantId === value.tenantId &&
                  row.title === value.title &&
                  row.version === value.version,
              )
            )
              return []
            const row = { ...structuredClone(value), id: 'saved-template', deletedAt: null }
            rows.risk_templates!.push(row)
            return [structuredClone(row)]
          },
        }),
      }),
    }),
  } as unknown as Database
  const db = vi.fn(async (run: Parameters<RequestContext['db']>[0]) => {
    const before = structuredClone(rows)
    try {
      return await run(tx)
    } catch (error) {
      rows = before
      throw error
    }
  })
  const ctx: RequestContext = {
    tenantId: A,
    userId: 'synthetic-a',
    membership: { id: 'member-a', displayName: 'Synthetic manager' },
    personId: null,
    isSuperAdmin: false,
    scopes: [{ type: 'tenant' }],
    permissions: new Set(['hospitality.manage']),
    timezone: 'Europe/London',
    locale: 'en',
    defaultLocale: 'en',
    enabledLocales: ['en'],
    localeOverride: null,
    db: db as RequestContext['db'],
  }
  return { ctx, db, rows: () => rows, locks }
}

beforeEach(() => audit.mockReset())

describe('Independent tenant Risk templates', () => {
  it('copies a master into tenant A without changing the master or tenant B', async () => {
    const f = fixture()
    const originals = structuredClone(f.rows().risk_templates)
    const template = await saveTenantRiskTemplate(f.ctx, {
      source: { kind: 'template', id: 'master' },
      title: 'Tenant A guidance',
      description: 'Tenant A description',
    })
    expect(template.tenantId).toBe(A)
    expect(f.rows().risk_templates!.slice(0, 2)).toEqual(originals)
    template.hazards[0]!.standardControls.push('Later change')
    expect(f.rows().risk_templates![0]).toEqual(originals![0])
    expect(audit.mock.calls[0]![2]).toMatchObject({
      metadata: { sourceKind: 'template', sourceId: 'master' },
    })
  })

  it('creates an unpublished draft from saved content without transferring source IDs, action ownership or sign-offs', async () => {
    const f = fixture()
    const template = await saveTenantRiskTemplate(f.ctx, {
      source: { kind: 'assessment', id: 'assessment-a' },
      title: 'Amended guidance',
      description: 'Reusable synthetic guidance',
    })
    expect(template.hazards).toEqual([
      {
        hazard: 'Amended synthetic hazard',
        harm: 'Synthetic harm',
        peopleAtRisk: ['Employees'],
        standardControls: ['Property-amended control'],
        initialLikelihood: 3,
        initialSeverity: 4,
        residualLikelihood: 1,
        residualSeverity: 2,
      },
    ])
    expect(template.furtherActionGuidance).toContain('Arrange additional training')
    expect(JSON.stringify(template)).not.toContain('saved-hazard-a')
    expect(JSON.stringify(template)).not.toContain('Private B content')
    const snapshot = buildRiskTemplateSnapshot(template)
    const adopted = templateHazardsToInput(snapshot.hazards)
    expect(adopted[0]).toMatchObject({
      controls: 'Property-amended control',
      initialLikelihood: 3,
      residualSeverity: 2,
    })
    expect(adopted[0]).not.toHaveProperty('id')
  })

  it.each([
    ['template', 'foreign-template'],
    ['assessment', 'assessment-b'],
  ] as const)('rejects tenant B %s sources', async (kind, id) => {
    const f = fixture()
    await expect(
      saveTenantRiskTemplate(f.ctx, {
        source: { kind, id },
        title: 'Copy',
        description: 'Description',
      }),
    ).rejects.toThrow(/not available/)
    expect(audit).not.toHaveBeenCalled()
  })

  it('denies property-only publication to a tenant-wide library before any query', async () => {
    const f = fixture()
    f.ctx.scopes = [{ type: 'properties', propertyIds: [PROPERTY] }]
    await expect(
      saveTenantRiskTemplate(f.ctx, {
        source: { kind: 'assessment', id: 'assessment-a' },
        title: 'Copy',
        description: 'Description',
      }),
    ).rejects.toThrow(/Tenant-wide/)
    expect(f.db).not.toHaveBeenCalled()
  })

  it('denies publication without hospitality management permission', async () => {
    const f = fixture()
    f.ctx.permissions.clear()
    await expect(
      saveTenantRiskTemplate(f.ctx, {
        source: { kind: 'template', id: 'master' },
        title: 'Copy',
        description: 'Description',
      }),
    ).rejects.toThrow()
    expect(f.db).not.toHaveBeenCalled()
  })

  it('does not overwrite a duplicate tenant title and version', async () => {
    const f = fixture()
    const input = {
      source: { kind: 'template' as const, id: 'master' },
      title: 'Copy',
      description: 'Description',
    }
    await saveTenantRiskTemplate(f.ctx, input)
    const before = structuredClone(f.rows())
    await expect(saveTenantRiskTemplate(f.ctx, input)).rejects.toThrow(/already exists/)
    expect(f.rows()).toEqual(before)
    expect(audit).toHaveBeenCalledTimes(1)
  })

  it('rolls back the new template when transactional audit fails', async () => {
    const f = fixture()
    const before = structuredClone(f.rows())
    audit.mockRejectedValueOnce(new Error('Audit failed'))
    await expect(
      saveTenantRiskTemplate(f.ctx, {
        source: { kind: 'template', id: 'master' },
        title: 'Copy',
        description: 'Description',
      }),
    ).rejects.toThrow(/Audit failed/)
    expect(f.rows()).toEqual(before)
  })

  it('rejects retired master templates', async () => {
    const f = fixture()
    f.rows().risk_templates![0]!.state = 'retired'
    await expect(
      saveTenantRiskTemplate(f.ctx, {
        source: { kind: 'template', id: 'master' },
        title: 'Copy',
        description: 'Description',
      }),
    ).rejects.toThrow(/not available/)
  })

  it('keeps newer-version recommendations within the adopted template owner', async () => {
    const f = fixture()
    const candidates = [
      { ownerKey: PLATFORM, version: '9.0' },
      { ownerKey: A, version: '1.1' },
      { ownerKey: B, version: '8.0' },
    ]
    f.ctx.db = (async (run: Parameters<RequestContext['db']>[0]) =>
      run({
        select: () => ({
          from: (table: Table) => ({
            where: async (condition: SQL) => {
              expect(table).toBe(riskTemplates)
              const query = new PgDialect().sqlToQuery(condition)
              expect(query.sql).toContain('"owner_key" =')
              expect(query.params).toContain(A)
              return candidates.filter((row) => row.ownerKey === query.params[1])
            },
          }),
        }),
      } as unknown as Database)) as RequestContext['db']
    const result = await getNewerRiskTemplate(f.ctx, {
      templateOwnerKey: A,
      adoptedTemplateVersion: '1.0',
      adoptedTemplateSnapshot: { title: 'Same title', templateId: 'template-a' },
    } as typeof riskAssessments.$inferSelect)
    expect(result?.version).toBe('1.1')
  })

  it('does not treat RA-002 technical coexistence version 1.1 as a successor to the legacy template', async () => {
    const f = fixture()
    const ra002 = RISK_CATALOGUE_TEMPLATES[1]!
    const candidate = {
      ...structuredClone(ra002),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }
    f.ctx.db = (async (run: Parameters<RequestContext['db']>[0]) =>
      run({
        select: () => ({
          from: (table: Table) => ({
            where: async () => {
              expect(table).toBe(riskTemplates)
              return [candidate]
            },
          }),
        }),
      } as unknown as Database)) as RequestContext['db']
    const result = await getNewerRiskTemplate(f.ctx, {
      templateOwnerKey: PLATFORM,
      adoptedTemplateVersion: '1.0',
      adoptedTemplateSnapshot: {
        templateId: SLIPS_TRIPS_TEMPLATE.id,
        version: '1.0',
        title: 'Slips, Trips and Falls',
      },
    } as typeof riskAssessments.$inferSelect)
    expect(result).toBeNull()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Database } from '@beaconhs/db'
import type { RequestContext } from '@beaconhs/tenant'
import { updateRiskAssessment, type UpdateRiskAssessmentInput } from './risk-assessments'
import { canonicalRiskMatrixSnapshot } from '@beaconhs/db/risk-matrix'

const audit = vi.hoisted(() => vi.fn())
vi.mock('@/lib/audit', () => ({ recordAuditInTransaction: audit }))

const A = '10000000-0000-4000-8000-000000000001'
const B = '10000000-0000-4000-8000-000000000002'
const PROPERTY = '20000000-0000-4000-8000-000000000001'
const OTHER_PROPERTY = '20000000-0000-4000-8000-000000000002'
type Row = Record<string, unknown> & { id: string; tenantId: string }
type Table = Parameters<typeof getTableName>[0]

// A transaction double exercises the real service and permission helpers. It
// enforces scoped predicates and immediate order uniqueness, but is not SQL/RLS
// integration evidence; those checks require the separately approved database.
function fixture() {
  let rows: Record<string, Row[]> = {
    risk_assessments: [
      {
        id: 'assessment-a',
        tenantId: A,
        propertyId: PROPERTY,
        title: 'Original',
        reference: 'RA-A',
        contentRevision: 1,
        matrixSnapshot: canonicalRiskMatrixSnapshot(),
        deletedAt: null,
      },
      {
        id: 'assessment-b',
        tenantId: B,
        propertyId: OTHER_PROPERTY,
        title: 'Other tenant',
        deletedAt: null,
      },
    ],
    risk_hazards: [
      {
        id: 'hazard-a1',
        tenantId: A,
        assessmentId: 'assessment-a',
        sortOrder: 0,
        controls: 'Original control',
      },
      {
        id: 'hazard-a2',
        tenantId: A,
        assessmentId: 'assessment-a',
        sortOrder: 1,
        controls: 'Second control',
      },
      { id: 'hazard-b', tenantId: B, assessmentId: 'assessment-b', sortOrder: 0 },
    ],
    tenant_users: [{ id: 'member-a', tenantId: A }],
  }
  const action = {
    tenantId: A,
    sourceEntityId: 'hazard-a1',
    owner: 'member-a',
    propertyId: PROPERTY,
  }
  const locks: string[] = []
  const dialect = new PgDialect()
  function selected(table: Table, condition: SQL) {
    const query = dialect.sqlToQuery(condition)
    const name = getTableName(table)
    expect(query.sql).toContain('"tenant_id" =')
    if (name === 'risk_hazards') expect(query.sql).toContain('"assessment_id" =')
    return (rows[name] ?? []).filter(
      (row) =>
        row.tenantId === query.params[0] &&
        (name === 'risk_hazards'
          ? row.assessmentId === query.params[1] && (!query.params[2] || row.id === query.params[2])
          : row.id === query.params[1]),
    )
  }
  const tx = {
    execute: async () => [
      {
        content: {
          assessment: structuredClone(rows.risk_assessments![0]),
          hazards: structuredClone(rows.risk_hazards!.filter((row) => row.tenantId === A)),
          matrix: canonicalRiskMatrixSnapshot(),
        },
      },
    ],
    select: () => ({
      from: (table: Table) => ({
        where: (condition: SQL) => {
          const result = structuredClone(selected(table, condition))
          const terminal = () =>
            Object.assign(Promise.resolve(result), {
              for: async (mode: string) => {
                expect(mode).toBe('update')
                locks.push(getTableName(table))
                return result
              },
            })
          return { limit: terminal, orderBy: terminal }
        },
      }),
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: SQL) => {
          const updated = selected(table, condition).map((row) => {
            if (getTableName(table) === 'risk_hazards') {
              expect(locks).toEqual(['risk_assessments', 'risk_hazards'])
              if (
                rows.risk_hazards!.some(
                  (other) =>
                    other.id !== row.id &&
                    other.tenantId === row.tenantId &&
                    other.assessmentId === row.assessmentId &&
                    other.sortOrder === values.sortOrder,
                )
              )
                throw new Error('Duplicate hazard sort position')
            }
            Object.assign(row, values)
            return structuredClone(row)
          })
          return Object.assign(Promise.resolve(), { returning: async () => updated })
        },
      }),
    }),
    insert: (table: Table) => ({
      values: (value: Row) => {
        if (getTableName(table) === 'risk_assessment_versions') {
          const versions = (rows.risk_assessment_versions ??= [])
          versions.push(structuredClone(value))
          return Promise.resolve()
        }
        return {
          returning: async () => {
            const row = { ...value, id: 'server-generated-hazard' }
            rows[getTableName(table)]!.push(row)
            return [structuredClone(row)]
          },
        }
      },
    }),
    delete: () => {
      throw new Error('Saved hazard deletion must never occur')
    },
  } as unknown as Database
  const ctx: RequestContext = {
    tenantId: A,
    userId: 'user-a',
    isSuperAdmin: false,
    timezone: 'Europe/London',
    locale: 'en',
    defaultLocale: 'en',
    enabledLocales: ['en'],
    localeOverride: null,
    membership: { id: 'member-a', displayName: 'Synthetic manager' },
    personId: null,
    scopes: [{ type: 'properties', propertyIds: [PROPERTY] }],
    permissions: new Set(['hospitality.manage']),
    db: async (run) => {
      const before = structuredClone(rows)
      try {
        return await run(tx)
      } catch (error) {
        rows = before
        throw error
      }
    },
  }
  const input: UpdateRiskAssessmentInput = {
    expectedRevision: 1,
    title: 'Amended assessment',
    assessorTenantUserId: 'member-a',
    assessmentDate: '2026-10-09',
    hazards: ['hazard-a2', 'hazard-a1'].map((id) => ({
      id,
      hazardDescription: 'Synthetic hazard',
      harmDescription: 'Synthetic harm',
      peopleAtRisk: ['Employees'],
      initialLikelihood: 3,
      initialSeverity: 4,
      controls: 'Amended control',
      residualLikelihood: 1,
      residualSeverity: 2,
    })),
  }
  return { ctx, input, action, rows: () => structuredClone(rows), locks }
}

beforeEach(() => audit.mockReset())

describe('Risk assessment edit service', () => {
  it('rejects stale revisions before mutating any rows', async () => {
    const f = fixture(),
      before = f.rows()
    f.input.expectedRevision = 0
    await expect(updateRiskAssessment(f.ctx, 'assessment-a', f.input)).rejects.toThrow(/changed/)
    expect(f.rows()).toEqual(before)
    expect(audit).not.toHaveBeenCalled()
  })
  it('edits and reorders without changing action source, owner or property', async () => {
    const f = fixture()
    const actionBefore = structuredClone(f.action)
    const result = await updateRiskAssessment(f.ctx, 'assessment-a', f.input)
    expect(result.assessment.contentRevision).toBe(2)
    expect(result.assessment.status).toBe('draft')
    expect(f.rows().risk_assessment_versions).toHaveLength(1)
    expect(f.rows().risk_assessment_versions![0]).toMatchObject({
      tenantId: A,
      assessmentId: 'assessment-a',
      revision: 2,
      event: 'edited',
      actorTenantUserId: 'member-a',
    })
    expect(result.hazards.map((h) => h.id)).toEqual(['hazard-a2', 'hazard-a1'])
    expect(result.hazards.map((h) => h.sortOrder)).toEqual([0, 1])
    expect(result.hazards[0]).toMatchObject({
      controls: 'Amended control',
      initialScore: 12,
      residualScore: 2,
    })
    expect(f.action).toEqual(actionBefore)
    expect(result.hazards.find((h) => h.id === f.action.sourceEntityId)).toBeDefined()
    expect(audit.mock.calls[0]![2]).toMatchObject({
      before: { hazards: [{ controls: 'Original control' }, { controls: 'Second control' }] },
      after: { hazardCount: 2 },
    })
  })

  it('returns the persisted identity of a newly added hazard', async () => {
    const f = fixture()
    f.input.hazards.push({ ...f.input.hazards[0]!, id: undefined })
    const result = await updateRiskAssessment(f.ctx, 'assessment-a', f.input)
    expect(result.hazards[2]).toMatchObject({
      id: 'server-generated-hazard',
      sortOrder: 2,
      tenantId: A,
    })
  })

  it('rejects a hazard ID from synthetic tenant B with no partial changes', async () => {
    const f = fixture()
    const before = f.rows()
    f.input.hazards[0]!.id = 'hazard-b'
    await expect(updateRiskAssessment(f.ctx, 'assessment-a', f.input)).rejects.toThrow(
      /does not belong/,
    )
    expect(f.rows()).toEqual(before)
    expect(audit).not.toHaveBeenCalled()
  })

  it('denies access to synthetic tenant B assessment', async () => {
    const f = fixture()
    await expect(updateRiskAssessment(f.ctx, 'assessment-b', f.input)).rejects.toThrow(/not found/)
    expect(audit).not.toHaveBeenCalled()
  })

  it('denies a same-tenant user assigned only to a different property', async () => {
    const f = fixture()
    f.ctx.scopes = [{ type: 'properties', propertyIds: [OTHER_PROPERTY] }]
    await expect(updateRiskAssessment(f.ctx, 'assessment-a', f.input)).rejects.toThrow(
      /hospitality.property.scope/,
    )
    expect(audit).not.toHaveBeenCalled()
  })

  it('denies editing without hospitality management permission', async () => {
    const f = fixture()
    f.ctx.permissions.clear()
    await expect(updateRiskAssessment(f.ctx, 'assessment-a', f.input)).rejects.toThrow()
    expect(f.locks).toEqual([])
  })

  it('rejects saved-hazard removal before writing any assessment changes', async () => {
    const f = fixture()
    const before = f.rows()
    f.input.hazards.pop()
    await expect(updateRiskAssessment(f.ctx, 'assessment-a', f.input)).rejects.toThrow(
      /must be retained/,
    )
    expect(f.rows()).toEqual(before)
  })

  it('rolls back assessment and hazard edits when the transactional audit fails', async () => {
    const f = fixture()
    const before = f.rows()
    audit.mockRejectedValueOnce(new Error('Audit unavailable'))
    await expect(updateRiskAssessment(f.ctx, 'assessment-a', f.input)).rejects.toThrow(
      /Audit unavailable/,
    )
    expect(f.rows()).toEqual(before)
  })
})

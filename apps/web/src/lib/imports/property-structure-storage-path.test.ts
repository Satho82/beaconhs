import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getObject: vi.fn(),
  assertCan: vi.fn(),
  assertEntitled: vi.fn(),
  audit: vi.fn(),
  context: undefined as unknown,
}))

vi.mock('server-only', () => ({}))
vi.mock('@beaconhs/storage', () => ({ getObject: mocks.getObject }))
vi.mock('@beaconhs/tenant', () => ({ assertCan: mocks.assertCan }))
vi.mock('@/lib/auth', () => ({ requireRequestContext: async () => mocks.context }))
vi.mock('@/lib/module-entitlements/server', () => ({
  assertTenantModuleEntitled: mocks.assertEntitled,
}))
vi.mock('@/lib/audit', () => ({ recordAuditInTransaction: mocks.audit }))

import { propertyStructureTemplateCsv } from './property-structure'
import { getPropertyStructurePreview } from './property-structure-preview'
import { validatePropertyStructureUpload } from './property-structure-upload'

const tenantId = '10000000-0000-4000-8000-000000000001'
const userId = 'user-1'
const attachmentId = '20000000-0000-4000-8000-000000000002'
const batchId = '30000000-0000-4000-8000-000000000003'
const csv = `${propertyStructureTemplateCsv()}hotel-a,Hotel A,Europe/London,main,Main,ground,Ground,101,Room 101,Double\r\n`

describe('Property Structure storage-backed acceptance path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads a finalized tenant CSV from private storage and persists a validated preview batch', async () => {
    const writes: unknown[] = []
    const attachmentTx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: attachmentId,
                r2Key: `tenants/${tenantId}/imports/property-structure.csv`,
                contentType: 'text/csv',
                sizeBytes: Buffer.byteLength(csv),
              },
            ],
          }),
        }),
      }),
    }
    const batchTx = {
      insert: () => ({
        values: (value: unknown) => {
          writes.push(value)
          return { returning: async () => [{ id: batchId }] }
        },
      }),
    }
    let dbCall = 0
    mocks.context = {
      tenantId,
      userId,
      permissions: new Set(['admin.settings.manage', 'hospitality.manage']),
      db: async (run: (tx: unknown) => Promise<unknown>) =>
        run(dbCall++ === 0 ? attachmentTx : batchTx),
    }
    mocks.getObject.mockResolvedValue(Buffer.from(csv))

    await expect(validatePropertyStructureUpload({ attachmentId })).resolves.toEqual({
      ok: true,
      batchId,
    })
    expect(mocks.getObject).toHaveBeenCalledWith({
      key: `tenants/${tenantId}/imports/property-structure.csv`,
    })
    expect(mocks.assertCan.mock.calls.map(([, permission]) => permission)).toEqual([
      'admin.settings.manage',
      'hospitality.manage',
    ])
    expect(mocks.assertEntitled).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId }),
      'hospitality.properties',
    )
    expect(writes).toHaveLength(2)
    expect(writes[0]).toMatchObject({
      tenantId,
      datasetKey: 'property.structure',
      sourceAttachmentId: attachmentId,
      status: 'ready_for_confirmation',
    })
    expect(writes[1]).toEqual([
      expect.objectContaining({
        tenantId,
        batchId,
        sourceRowNumber: 2,
        status: 'accepted',
      }),
    ])
    expect(mocks.audit).toHaveBeenCalledWith(
      batchTx,
      expect.objectContaining({ tenantId }),
      expect.objectContaining({
        entityType: 'bulk_import_batch',
        entityId: batchId,
        action: 'create',
      }),
    )
  })

  it('returns the stored validation rows as an eligible read-only preview', async () => {
    let selection = 0
    const tx = {
      select: () => ({
        from: () => ({
          where: () => {
            selection += 1
            if (selection === 1) {
              return {
                limit: async () => [
                  {
                    id: batchId,
                    datasetKey: 'property.structure',
                    status: 'ready_for_confirmation',
                  },
                ],
              }
            }
            return {
              orderBy: async () => [
                {
                  sourceRowNumber: 2,
                  rawValues: {
                    property_code: 'hotel-a',
                    property_name: 'Hotel A',
                    property_timezone: 'Europe/London',
                    building_code: 'main',
                    building_name: 'Main',
                    floor_code: 'ground',
                    floor_name: 'Ground',
                    room_code: '101',
                    room_name: 'Room 101',
                    room_type: 'Double',
                  },
                  proposedAction: 'create',
                  status: 'accepted',
                  issues: [],
                  duplicateReference: null,
                },
              ],
            }
          },
        }),
      }),
    }
    mocks.context = {
      tenantId,
      userId,
      permissions: new Set(['admin.settings.manage', 'hospitality.manage']),
      db: async (run: (tx: unknown) => Promise<unknown>) => run(tx),
    }

    await expect(getPropertyStructurePreview(batchId, 'all')).resolves.toMatchObject({
      batch: { id: batchId, datasetKey: 'property.structure', status: 'ready_for_confirmation' },
      summary: { total: 1, valid: 1, errors: 0, warnings: 0, duplicates: 0 },
      hierarchy: { rows: 1, propertiesToCreate: 1, roomsToCreate: 1 },
      rows: [
        {
          sourceRowNumber: 2,
          recordType: 'Room',
          reference: '101',
          name: 'Room 101',
          status: 'accepted',
        },
      ],
      eligibleForReview: true,
    })
  })
})

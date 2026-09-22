import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@beaconhs/tenant'

const state = vi.hoisted(() => ({
  action: true,
  incident: true,
  handover: true,
  maintenance: true,
  inspectionCompliance: true,
  calls: 0,
}))
vi.mock('./action-attachment-access', () => ({
  canReadActionAttachment: async () => {
    state.calls++
    return state.action
  },
}))
vi.mock('./incidents/attachment-access', () => ({
  canReadIncidentAttachment: async () => state.incident,
}))
vi.mock('./hospitality/handover-attachment-access', () => ({
  canReadHandoverAttachment: async () => state.handover,
}))
vi.mock('./hospitality/maintenance-attachment-access', () => ({
  canReadMaintenanceAttachment: async () => state.maintenance,
}))
vi.mock('./inspection-compliance-attachment-access', () => ({
  canReadInspectionComplianceAttachment: async () => state.inspectionCompliance,
}))
import {
  assertCanUseEvidenceAttachments,
  canReadEvidenceAttachment,
} from './attachment-evidence-access'

const ctx = {} as RequestContext
const id = '70000000-0000-4000-8000-000000000001'

describe('shared evidence mutation authorization', () => {
  beforeEach(() => {
    Object.assign(state, {
      action: true,
      incident: true,
      handover: true,
      maintenance: true,
      inspectionCompliance: true,
      calls: 0,
    })
  })

  it.each(['action', 'incident', 'handover', 'maintenance', 'inspectionCompliance'] as const)(
    'rejects evidence with an inaccessible %s parent',
    async (source) => {
      state[source] = false
      expect(await canReadEvidenceAttachment(ctx, id)).toBe(false)
      await expect(assertCanUseEvidenceAttachments(ctx, [id])).rejects.toThrow(
        'Attachment is not available in your property scope.',
      )
    },
  )

  it('allows evidence only when all linked module scopes allow it', async () => {
    expect(await canReadEvidenceAttachment(ctx, id)).toBe(true)
  })

  it('rejects malformed attachment IDs before any database lookup', async () => {
    expect(await canReadEvidenceAttachment(ctx, 'forged')).toBe(false)
    expect(state.calls).toBe(0)
  })

  it('checks duplicate IDs once and permits an empty new-photo list', async () => {
    await assertCanUseEvidenceAttachments(ctx, [])
    expect(state.calls).toBe(0)
    await assertCanUseEvidenceAttachments(ctx, [id, id])
    expect(state.calls).toBe(1)
  })
})

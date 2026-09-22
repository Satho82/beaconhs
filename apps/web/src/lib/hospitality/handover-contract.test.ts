import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const service = readFileSync(new URL('./handover.ts', import.meta.url), 'utf8')
const attachmentAccess = readFileSync(
  new URL('./handover-attachment-access.ts', import.meta.url),
  'utf8',
)
const page = readFileSync(
  new URL('../../app/(app)/hospitality/handover/page.tsx', import.meta.url),
  'utf8',
)

describe('Hotel Handover service contracts', () => {
  it('enforces permission and property access on the server, including visible parents', () => {
    expect(service).toContain("assertCan(ctx, 'hospitality.read')")
    expect(service).toContain("assertCan(ctx, 'hospitality.manage')")
    expect(service).toContain('assertCanAccessProperty(ctx, propertyId)')
    expect(service).toContain('assertCanAccessProperty(ctx, row.propertyId)')
  })

  it('validates forged related identifiers against the selected property', () => {
    expect(service).toContain('assertRoomForProperty')
    expect(service).toContain('assertMemberForProperty')
    expect(service).toContain('assertMaintenanceForProperty')
    expect(service).toContain('hospitalityBuildings.propertyId')
    expect(service).toContain('roleAssignments.scope')
  })

  it('reuses shared Actions, secure evidence access, and transactional audit records', () => {
    expect(service).toContain("sourceEntityType: 'hospitality_handover'")
    expect(service).toContain('canReadActionAttachment')
    expect(service).toContain('recordAuditInTransaction')
    expect(service).toContain("entityType: 'hospitality_handover'")
    expect(attachmentAccess).toContain('withSuperAdmin')
    expect(attachmentAccess).toContain('ctx.db')
  })

  it('exposes the complete minimum chronological feed workflow', () => {
    for (const action of [
      'createHandover',
      'acknowledgeHandover',
      'commentOnHandover',
      'updateHandoverFollowUp',
      'carryForwardHandover',
      'attachHandoverPhotos',
    ]) {
      expect(page).toContain(action)
    }
    expect(page).toContain('resolveHospitalityPropertyContext')
    expect(page).toContain('PhotoUploaderSection')
  })
})

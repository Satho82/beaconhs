import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const maintenance = readFileSync(new URL('./maintenance.ts', import.meta.url), 'utf8')
const guest = readFileSync(new URL('./guest-maintenance.ts', import.meta.url), 'utf8')
const access = readFileSync(new URL('./maintenance-attachment-access.ts', import.meta.url), 'utf8')
const route = readFileSync(
  new URL('../../app/api/attachments/[id]/route.ts', import.meta.url),
  'utf8',
)
const detail = readFileSync(
  new URL('../../app/(app)/hospitality/maintenance/[issueId]/page.tsx', import.meta.url),
  'utf8',
)

describe('maintenance evidence security contract', () => {
  it('authorizes staff links through tenant attachment validation and property access', () => {
    expect(maintenance).toContain('validateTenantImageAttachmentIdsInTx')
    expect(maintenance).toContain('assertCanAccessProperty(ctx, issue.propertyId)')
    expect(maintenance).toContain("'before_work'")
    expect(maintenance).toContain("'after_work'")
    expect(maintenance).toContain("'completion'")
  })

  it('keeps guest uploads private and bound to token-derived room provenance', () => {
    expect(guest).toContain('resolveGuestRoomTarget(input.token)')
    expect(guest).toContain('roomId: target.roomId')
    expect(guest).toContain("source: 'guest_qr'")
    expect(guest).toContain('uploadedFileHeaderError')
    expect(guest).not.toContain('presignGet')
  })

  it('requires property-visible parent authorization before download', () => {
    expect(access).toContain('withSuperAdmin')
    expect(access).toContain('ctx.db')
    expect(route).toContain('canReadMaintenanceAttachment')
  })

  it('groups multiple evidence items by operational stage in the issue experience', () => {
    expect(detail).toContain('PhotoUploaderSection')
    expect(detail).toContain("['reported', 'before_work', 'after_work', 'completion']")
    expect(detail).toContain('data.evidence.filter')
  })
})

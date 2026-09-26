import { sql } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import type { RequestContext } from '@beaconhs/tenant'

/** Discover all existing evidence parents, then require every parent under live request RLS.
 * A new accessible link must never launder an inaccessible original attachment.
 */
export async function canReadInspectionComplianceAttachment(
  ctx: RequestContext,
  attachmentId: string,
) {
  const links = sql`
    SELECT 'inspection:' || r.id::text AS id FROM inspection_records r
    WHERE r.tenant_id=${ctx.tenantId} AND (
      r.customer_signature_attachment_id=${attachmentId}::uuid
      OR EXISTS (SELECT 1 FROM inspection_record_attachments a
        WHERE a.tenant_id=r.tenant_id AND a.record_id=r.id AND a.attachment_id=${attachmentId}::uuid)
      OR EXISTS (SELECT 1 FROM inspection_record_criteria c
        WHERE c.tenant_id=r.tenant_id AND c.record_id=r.id AND c.photo_attachment_ids ? ${attachmentId})
    )
    UNION
    SELECT 'equipment:' || r.id::text FROM equipment_inspection_records r
    WHERE r.tenant_id=${ctx.tenantId} AND (
      EXISTS (SELECT 1 FROM equipment_inspection_record_attachments a
        WHERE a.tenant_id=r.tenant_id AND a.record_id=r.id AND a.attachment_id=${attachmentId}::uuid)
      OR EXISTS (SELECT 1 FROM equipment_inspection_record_criteria c
        WHERE c.tenant_id=r.tenant_id AND c.record_id=r.id AND c.photo_attachment_ids ? ${attachmentId})
    )
    UNION
    SELECT 'compliance:' || o.id::text FROM compliance_obligations o
    JOIN documents d ON d.tenant_id=o.tenant_id AND d.id::text=o.target_ref->>'documentId'
    WHERE o.tenant_id=${ctx.tenantId} AND (
      d.source_attachment_id=${attachmentId}::uuid
      OR EXISTS (SELECT 1 FROM document_versions v WHERE v.tenant_id=d.tenant_id AND v.document_id=d.id
        AND ${attachmentId}::uuid IN (v.content_attachment_id,v.docx_attachment_id,v.pdf_attachment_id))
    )
    LIMIT 1001`
  const parents = await withSuperAdmin(db, (tx) => tx.execute<{ id: string }>(links))
  if (parents.length > 1000) return false
  if (!parents.length) return true
  const visible = await ctx.db((tx) => tx.execute<{ id: string }>(links))
  const ids = new Set(visible.map((row) => row.id))
  return parents.every((row) => ids.has(row.id))
}

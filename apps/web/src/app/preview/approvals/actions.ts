'use server'
import { revalidatePath } from 'next/cache'
import {
  createApprovalWorkflow,
  decideApproval,
  submitApprovalRequest,
} from '@/lib/approvals/service'
import { previewContext } from '@/lib/approvals/preview-server'
import { previewSubmission } from '@/lib/approvals/preview-submission'
import { recordAuditInTransaction } from '@/lib/audit'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { PREVIEW_ROOT } from '@/lib/approvals/preview-fixtures'

export async function submitPreviewRequest(input: unknown) {
  const ctx = await previewContext()
  try {
    const parsed = previewSubmission.safeParse(input)
    if (!parsed.success)
      return {
        ok: false as const,
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      }
    const value = parsed.data
    const version = createHash('sha256').update(JSON.stringify(value)).digest('hex')
    const result = await submitApprovalRequest(
      ctx,
      {
        workflowId: value.workflowId,
        idempotencyKey: value.idempotencyKey,
        source: { module: 'tasks', id: value.idempotencyKey, version },
      },
      {
        tasks: {
          module: 'tasks',
          async resolve(tx) {
            const rows = await tx.execute(
              sql`SELECT stages FROM approval_workflows WHERE tenant_id=${ctx.tenantId} AND id=${value.workflowId} AND property_id=${value.propertyId} AND active=true`,
            )
            if (!rows.length) throw new Error('Select an available workflow for this property')
            // Preview-only source snapshot: committed atomically with the request,
            // through the existing audit contract. No source-module or schema writes.
            await recordAuditInTransaction(tx, ctx, {
              entityType: 'preview_approval_source',
              entityId: value.idempotencyKey,
              action: 'create',
              summary: 'Synthetic preview submission snapshot',
              metadata: { ...value, synthetic: true },
              dedupKey: `preview-source:${value.idempotencyKey}`,
            })
            return { propertyId: value.propertyId, title: value.title, version }
          },
        },
      },
    )
    revalidatePath(PREVIEW_ROOT, 'layout')
    return { ok: true as const, id: result.id }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Request could not be submitted',
    }
  }
}
export async function decidePreviewRequest(input: unknown) {
  const ctx = await previewContext()
  try {
    const result = await decideApproval(ctx, input)
    revalidatePath(PREVIEW_ROOT, 'layout')
    return { ok: true as const, id: result.id }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Decision could not be saved',
    }
  }
}
export async function configurePreviewWorkflow(input: unknown) {
  const ctx = await previewContext()
  try {
    const result = await createApprovalWorkflow(ctx, input)
    revalidatePath(PREVIEW_ROOT, 'layout')
    return { ok: true as const, id: result.id }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Workflow could not be saved',
    }
  }
}

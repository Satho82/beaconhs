import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { assertCan } from '@beaconhs/tenant'
import { getRequestContext } from '@/lib/auth'
import { PREVIEW_ROOT, PREVIEW_TENANT } from './preview-fixtures'
import { isLocalApprovalsPreview } from './preview-guard'
import type { PreviewSubmission } from './preview-submission'
import { readPreviewCollections } from './preview-queries'

/** The preview can never connect to a remotely configured application database. */
export async function assertLocalPreview() {
  const host = (await headers()).get('host')
  if (
    !isLocalApprovalsPreview({
      mode: process.env.NODE_ENV,
      enabled: process.env.UVANOO_APPROVALS_PREVIEW,
      host,
      databaseUrl: process.env.DATABASE_URL,
    })
  )
    notFound()
}
export async function previewContext() {
  await assertLocalPreview()
  const ctx = await getRequestContext()
  if (!ctx) redirect(`${PREVIEW_ROOT}/login`)
  if (ctx.tenantId !== PREVIEW_TENANT || !ctx.userId.startsWith('approvals-preview-')) notFound()
  assertCan(ctx, 'approvals.read')
  return ctx
}
export type PreviewRequest = {
  source_details?: PreviewSubmission
  id: string
  title: string
  source_id: string
  status: 'pending' | 'approved' | 'rejected'
  requester_id: string
  current_stage: number
  stage_count: number
  created_at: string
  approver_id: string
  creator: string
  approver: string
  property_id: string
}
export async function previewData() {
  const ctx = await previewContext()
  const collection = await readPreviewCollections(ctx)
  return ctx.db(async (tx) => {
    const roles = await tx.execute(
      sql`SELECT name,permissions FROM roles WHERE tenant_id=${ctx.tenantId} ORDER BY name`,
    )
    return JSON.parse(
      JSON.stringify({
        ...collection,
        roles,
        memberId: ctx.membership!.id,
        name: ctx.membership!.displayName,
      }),
    ) as {
      requests: PreviewRequest[]
      workflows: Array<{
        id: string
        name: string
        stages: Array<{ name: string; approverId: string }>
      }>
      roles: Array<{ name: string; permissions: string[] }>
      memberId: string
      name: string
      permissions: string[]
      configurePropertyIds: string[]
    }
  })
}

import { z } from 'zod'
import type { Database } from '@beaconhs/db'
import type { RequestContext } from '@beaconhs/tenant'

export const sourceModule = z.enum([
  'risk',
  'maintenance',
  'compliance',
  'assets_ppm',
  'people',
  'tasks',
])
const sourceReference = z
  .object({
    module: sourceModule,
    id: z.string().uuid(),
    version: z.string().trim().min(1).max(200),
  })
  .strict()
type ApprovalSource = z.infer<typeof sourceReference>
export type ApprovalSourceModule = ApprovalSource['module']

/** Server-owned registry. Resolve the source inside the same tenant transaction.
 * Must validate visibility, authoritative property and version, and return a safe
 * canonical title. Adapters never approve or mutate the source lifecycle.
 */
export interface ApprovalSourceAdapter {
  readonly module: ApprovalSourceModule
  resolve(
    tx: Database,
    ctx: RequestContext,
    source: ApprovalSource,
  ): Promise<{
    propertyId: string
    title: string
    version: string
  }>
}
export type ApprovalAdapters = Readonly<
  Partial<Record<ApprovalSourceModule, ApprovalSourceAdapter>>
>

const stageInput = z
  .object({ name: z.string().trim().min(1).max(200), approverId: z.string().uuid() })
  .strict()
export const workflowInput = z
  .object({
    propertyId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    stages: z.array(stageInput).min(1).max(20),
  })
  .strict()
export const requestInput = z
  .object({
    workflowId: z.string().uuid(),
    source: sourceReference,
    idempotencyKey: z.string().uuid(),
  })
  .strict()
export const decisionInput = z
  .object({
    requestId: z.string().uuid(),
    stage: z.number().int().min(1).max(20),
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(4000).default(''),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine((x) => x.decision !== 'reject' || x.reason.length > 0, {
    message: 'A rejection reason is required',
    path: ['reason'],
  })

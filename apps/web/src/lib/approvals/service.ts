import { createHash, randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '@beaconhs/db'
import { tenantUsers } from '@beaconhs/db/schema'
import {
  assertCan,
  canSeeProperty,
  resolveMembershipAccess,
  type RequestContext,
} from '@beaconhs/tenant'
import { recordAuditInTransaction } from '../audit'
import { decisionInput, requestInput, workflowInput, type ApprovalAdapters } from './contracts'
import { approvalPropertyIds, assertApprovalPropertyAuthority } from './property-authority'

type RequestRow = {
  id: string
  tenant_id: string
  property_id: string
  workflow_id: string
  requester_id: string
  source_module: string
  source_id: string
  source_version: string
  status: string
  current_stage: number
  stage_count: number
}
type WorkflowRow = {
  id: string
  property_id: string
  active: boolean
  stages: Array<{ name: string; approverId: string }>
}
type DecisionRow = {
  id: string
  request_id: string
  property_id: string
  actor_id: string
  position: number
  decision: string
  reason: string
}

/** Uses RequestContext's existing transaction/RLS boundary; never a root connection. */
async function gate(tx: Database, ctx: RequestContext) {
  if (ctx.impersonation || ctx.apiKey || !ctx.membership)
    throw new Error('An active non-impersonated tenant member is required')
  const entitled = await tx.execute(sql`SELECT id FROM tenant_module_entitlements
    WHERE tenant_id=${ctx.tenantId} AND module_key='approvals' AND state='enabled'
    AND (effective_from IS NULL OR effective_from<=now())
    AND (effective_until IS NULL OR effective_until>now()) FOR SHARE`)
  if (!entitled.length) throw new Error('Approvals is disabled')
  const member = await tx
    .select()
    .from(tenantUsers)
    .where(
      and(
        eq(tenantUsers.tenantId, ctx.tenantId),
        eq(tenantUsers.id, ctx.membership.id),
        eq(tenantUsers.userId, ctx.userId),
        eq(tenantUsers.status, 'active'),
      ),
    )
    .for('share')
  if (!member.length) throw new Error('Active membership required')
  const fresh = await resolveMembershipAccess(tx, ctx.membership.id, ctx.activeRoleId)
  if (ctx.activeRoleId && fresh.appliedRoleId !== ctx.activeRoleId)
    throw new Error('Active role no longer available')
  return { ...ctx, permissions: fresh.permissions, scopes: fresh.scopes }
}

async function permission(
  tx: Database,
  ctx: RequestContext,
  fresh: RequestContext,
  key: string,
  propertyId: string,
) {
  // Keep the request's potentially narrower scope and permissions as an upper bound.
  assertCan(ctx, key)
  assertCan(fresh, key)
  await assertApprovalPropertyAuthority(
    tx,
    ctx,
    ctx.membership!.id,
    key,
    propertyId,
    ctx.activeRoleId,
  )
}

async function property(tx: Database, ctx: RequestContext, fresh: RequestContext, id: string) {
  if (!canSeeProperty(ctx, id) || !canSeeProperty(fresh, id))
    throw new Error('Property access denied')
  const rows = await tx.execute(
    sql`SELECT id FROM hospitality_properties WHERE tenant_id=${ctx.tenantId} AND id=${id} AND deleted_at IS NULL FOR SHARE`,
  )
  if (!rows.length) throw new Error('Property access denied')
}

async function approver(tx: Database, ctx: RequestContext, id: string, propertyId: string) {
  const rows = await tx
    .select()
    .from(tenantUsers)
    .where(
      and(
        eq(tenantUsers.tenantId, ctx.tenantId),
        eq(tenantUsers.id, id),
        eq(tenantUsers.status, 'active'),
      ),
    )
    .for('share')
  if (!rows.length) throw new Error('Approver is not an active tenant member')
  const access = await resolveMembershipAccess(tx, id)
  const candidate = {
    ...ctx,
    isSuperAdmin: false,
    permissions: access.permissions,
    scopes: access.scopes,
  }
  assertCan(candidate, 'approvals.decide')
  if (!canSeeProperty(candidate, propertyId))
    throw new Error('Approver cannot access this property')
  await assertApprovalPropertyAuthority(tx, ctx, id, 'approvals.decide', propertyId)
}

async function audit(
  tx: Database,
  ctx: RequestContext,
  requestId: string,
  action: 'create' | 'sign',
  metadata: Record<string, unknown>,
) {
  const key = `approval:${randomUUID()}`
  await recordAuditInTransaction(tx, ctx, {
    entityType: 'approval_request',
    entityId: requestId,
    action,
    summary: 'Approval lifecycle event',
    metadata,
    dedupKey: key,
  })
  const rows = await tx.execute(
    sql`SELECT id FROM audit_log WHERE tenant_id=${ctx.tenantId} AND dedup_key=${key}`,
  )
  if (!rows[0]) throw new Error('Approval audit was not persisted')
  return { id: String(rows[0].id), key }
}

export async function createApprovalWorkflow(ctx: RequestContext, input: unknown) {
  const value = workflowInput.parse(input)
  return ctx.db(async (tx) => {
    const fresh = await gate(tx, ctx)
    await property(tx, ctx, fresh, value.propertyId)
    await permission(tx, ctx, fresh, 'approvals.configure', value.propertyId)
    for (const stage of value.stages) await approver(tx, ctx, stage.approverId, value.propertyId)
    const id = randomUUID()
    await tx.execute(
      sql`INSERT INTO approval_workflows(id,tenant_id,property_id,name,stages) VALUES(${id},${ctx.tenantId},${value.propertyId},${value.name},${JSON.stringify(value.stages)}::jsonb)`,
    )
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'approval_workflow',
      entityId: id,
      action: 'create',
      summary: 'Approval workflow created',
      metadata: { propertyId: value.propertyId, stageCount: value.stages.length },
    })
    return { id }
  })
}

export async function submitApprovalRequest(
  ctx: RequestContext,
  input: unknown,
  adapters: ApprovalAdapters,
) {
  const value = requestInput.parse(input)
  const adapter = adapters[value.source.module]
  if (!adapter || adapter.module !== value.source.module)
    throw new Error('Approval source adapter is not enabled')
  return ctx.db(async (tx) => {
    const fresh = await gate(tx, ctx)
    // Serialize creation retries before resolving a mutable source again.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.tenantId + ':approval:' + value.idempotencyKey},0))`,
    )
    const previous = (
      await tx.execute(
        sql`SELECT * FROM approval_requests WHERE tenant_id=${ctx.tenantId} AND creation_key=${value.idempotencyKey}`,
      )
    )[0] as RequestRow | undefined
    if (previous) {
      await property(tx, ctx, fresh, previous.property_id)
      await permission(tx, ctx, fresh, 'approvals.submit', previous.property_id)
      if (
        previous.requester_id !== ctx.membership!.id ||
        previous.workflow_id !== value.workflowId ||
        previous.source_module !== value.source.module ||
        previous.source_id !== value.source.id ||
        previous.source_version !== value.source.version
      )
        throw new Error('Idempotency key conflicts with another request')
      return { id: previous.id }
    }
    const workflow = (
      await tx.execute(
        sql`SELECT * FROM approval_workflows WHERE tenant_id=${ctx.tenantId} AND id=${value.workflowId}`,
      )
    )[0] as WorkflowRow | undefined
    if (!workflow?.active) throw new Error('Workflow unavailable')
    await property(tx, ctx, fresh, workflow.property_id)
    await permission(tx, ctx, fresh, 'approvals.submit', workflow.property_id)
    const resolved = await adapter.resolve(tx, ctx, value.source)
    if (
      resolved.propertyId !== workflow.property_id ||
      resolved.version !== value.source.version ||
      !resolved.title.trim() ||
      resolved.title.length > 300
    )
      throw new Error('Source scope or version mismatch')
    for (const stage of workflow.stages) {
      if (stage.approverId === ctx.membership!.id) throw new Error('Self-approval is not permitted')
      await approver(tx, ctx, stage.approverId, workflow.property_id)
    }
    const id = randomUUID()
    await tx.execute(sql`INSERT INTO approval_requests(id,tenant_id,property_id,workflow_id,requester_id,title,source_module,source_id,source_version,creation_key,stage_count)
      VALUES(${id},${ctx.tenantId},${workflow.property_id},${workflow.id},${ctx.membership!.id},${resolved.title.trim()},${value.source.module},${value.source.id},${value.source.version},${value.idempotencyKey},${workflow.stages.length})`)
    for (const [index, stage] of workflow.stages.entries())
      await tx.execute(
        sql`INSERT INTO approval_stages(tenant_id,property_id,request_id,position,name,approver_id) VALUES(${ctx.tenantId},${workflow.property_id},${id},${index + 1},${stage.name},${stage.approverId})`,
      )
    const auditId = await audit(tx, ctx, id, 'create', {
      propertyId: workflow.property_id,
      kind: 'submitted',
    })
    await tx.execute(
      sql`INSERT INTO approval_events(tenant_id,property_id,request_id,actor_id,kind,audit_id,audit_key,evidence) VALUES(${ctx.tenantId},${workflow.property_id},${id},${ctx.membership!.id},'submitted',${auditId.id},${auditId.key},${JSON.stringify({ source: value.source, stages: workflow.stages })}::jsonb)`,
    )
    return { id }
  })
}

export async function decideApproval(ctx: RequestContext, input: unknown) {
  const value = decisionInput.parse(input)
  return ctx.db(async (tx) => {
    const fresh = await gate(tx, ctx)
    const request = (
      await tx.execute(
        sql`SELECT * FROM approval_requests WHERE tenant_id=${ctx.tenantId} AND id=${value.requestId} FOR UPDATE`,
      )
    )[0] as RequestRow | undefined
    if (!request) throw new Error('Approval request unavailable')
    await property(tx, ctx, fresh, request.property_id)
    await permission(tx, ctx, fresh, 'approvals.decide', request.property_id)
    if (request.requester_id === ctx.membership!.id)
      throw new Error('Self-approval is not permitted')
    const stage = (
      await tx.execute(
        sql`SELECT approver_id FROM approval_stages WHERE tenant_id=${ctx.tenantId} AND request_id=${request.id} AND position=${value.stage}`,
      )
    )[0]
    if (!stage || stage.approver_id !== ctx.membership!.id)
      throw new Error('Not the assigned approver')
    const previous = (
      await tx.execute(
        sql`SELECT * FROM approval_decisions WHERE tenant_id=${ctx.tenantId} AND idempotency_key=${value.idempotencyKey}`,
      )
    )[0] as DecisionRow | undefined
    if (previous) {
      if (
        previous.request_id !== value.requestId ||
        previous.actor_id !== ctx.membership!.id ||
        previous.position !== value.stage ||
        previous.decision !== value.decision ||
        previous.reason !== value.reason
      )
        throw new Error('Idempotency key conflicts with another decision')
      return { id: previous.id }
    }
    if (request.status !== 'pending' || request.current_stage !== value.stage)
      throw new Error('Approval stage is already resolved or not current')
    const id = randomUUID()
    // Shared audit is tenant-visible; sensitive reasons stay in property-scoped evidence.
    const auditId = await audit(tx, ctx, request.id, 'sign', {
      propertyId: request.property_id,
      decisionId: id,
      decision: value.decision,
      reasonDigest: createHash('sha256').update(value.reason).digest('hex'),
      stage: value.stage,
    })
    await tx.execute(sql`INSERT INTO approval_decisions(id,tenant_id,property_id,request_id,position,actor_id,decision,reason,idempotency_key,audit_id,audit_key)
      VALUES(${id},${ctx.tenantId},${request.property_id},${request.id},${value.stage},${ctx.membership!.id},${value.decision},${value.reason},${value.idempotencyKey},${auditId.id},${auditId.key})`)
    return { id }
  })
}

export async function approvalReadScope(tx: Database, ctx: RequestContext) {
  const fresh = await gate(tx, ctx)
  const propertyIds = await approvalPropertyIds(tx, ctx, fresh, 'approvals.read')
  return { fresh, propertyIds }
}

export async function readApprovalRequest(ctx: RequestContext, id: string) {
  const requestId = requestInput.shape.workflowId.parse(id)
  return ctx.db(async (tx) => {
    const { fresh, propertyIds } = await approvalReadScope(tx, ctx)
    const request = (
      await tx.execute(
        sql`SELECT * FROM approval_requests WHERE tenant_id=${ctx.tenantId} AND id=${requestId}
          AND property_id IN (SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(propertyIds)}::jsonb))`,
      )
    )[0] as RequestRow | undefined
    if (!request) throw new Error('Approval request unavailable')
    await property(tx, ctx, fresh, request.property_id)
    await permission(tx, ctx, fresh, 'approvals.read', request.property_id)
    const stages = await tx.execute(
      sql`SELECT * FROM approval_stages WHERE tenant_id=${ctx.tenantId} AND property_id=${request.property_id} AND request_id=${requestId} ORDER BY position`,
    )
    const events = await tx.execute(
      sql`SELECT * FROM approval_events WHERE tenant_id=${ctx.tenantId} AND property_id=${request.property_id} AND request_id=${requestId} ORDER BY occurred_at,id LIMIT 22`,
    )
    return { request, stages, events }
  })
}

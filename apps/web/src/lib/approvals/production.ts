import { createHash, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { Database } from '@beaconhs/db'
import { can, type RequestContext } from '@beaconhs/tenant'
import {
  putObject,
  deleteObject,
  newTenantObjectKey,
  assertTenantObjectKey,
  getObject,
} from '@beaconhs/storage'
import { recordDomainEvent } from '@beaconhs/events'
import { recordAuditInTransaction } from '../audit'
import {
  financialAuthority,
  gate,
  permission,
  property,
  approver,
  approvalReadScope,
  createApprovalWorkflow,
  submitApprovalRequest,
  decideApproval,
} from './service'
import { approvalPropertyIds } from './property-authority'
import {
  attachmentInput,
  financialInput,
  activityInput,
  productionWorkflowInput,
  amountMinor,
  documentType,
} from './production-contracts'
import { decisionInput } from './contracts'

type Row = Record<string, unknown>
const uuid = financialInput.shape.workflowId
function text(row: Row, key: string) {
  return String(row[key] ?? '')
}
function nested(ctx: RequestContext, tx: Database): RequestContext {
  return { ...ctx, db: async (fn) => fn(tx) }
}

async function notify(tx: Database, ctx: RequestContext, request: Row, eventId: string) {
  await recordDomainEvent(tx, {
    tenantId: ctx.tenantId,
    eventType: 'approval.updated',
    subjectId: text(request, 'id'),
    dedupKey: 'approval.updated:' + eventId,
    payload: { notification: { kind: 'approval_updated', requestId: text(request, 'id') } },
  })
}

async function teamPropertyIds(tx: Database, ctx: RequestContext, fresh: RequestContext) {
  const ids: string[] = []
  for (const key of ['approvals.configure', 'approvals.decide']) {
    if (can(ctx, key) && can(fresh, key))
      ids.push(...(await approvalPropertyIds(tx, ctx, fresh, key)))
  }
  return [...new Set(ids)]
}

async function readable(tx: Database, ctx: RequestContext, id: string, lock = false) {
  const { fresh, propertyIds } = await approvalReadScope(tx, ctx)
  const rows =
    await tx.execute(sql`SELECT r.*, approval_effective_assignee(r.tenant_id,r.property_id,r.id,r.current_stage) AS assignee_id,
    approval_assignment_version(r.tenant_id,r.property_id,r.id,r.current_stage) AS assignment_version
    FROM approval_requests r WHERE r.tenant_id=${ctx.tenantId} AND r.id=${uuid.parse(id)}
    AND r.property_id IN (SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(propertyIds)}::jsonb))
    ${lock ? sql`FOR UPDATE OF r` : sql``}`)
  const r = rows[0]
  if (!r) throw new Error('Approval request unavailable')
  await property(tx, ctx, fresh, text(r, 'property_id'))
  // Staff see their own submissions and assigned work. Team visibility needs property-bound decision/configuration authority.
  if (r.requester_id !== ctx.membership!.id && r.assignee_id !== ctx.membership!.id) {
    if (!(await teamPropertyIds(tx, ctx, fresh)).includes(text(r, 'property_id')))
      throw new Error('Team approval authority required')
  }
  return { request: r, fresh }
}

export async function createFinancialRequest(
  ctx: RequestContext,
  input: unknown,
  file: { name: string; bytes: Uint8Array },
) {
  const value = financialInput.parse(input)
  if (file.bytes.byteLength < 1 || file.bytes.byteLength > 10 * 1024 * 1024)
    throw new Error('Document must be at most 10 MB')
  const contentType = documentType(file.bytes)
  const filename = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 200)
  if (!filename) throw new Error('Document filename is required')
  const digest = createHash('sha256').update(file.bytes).digest('hex')
  const key = newTenantObjectKey({ tenantId: ctx.tenantId, scope: 'approvals', filename })
  let uploaded = false
  try {
    return await ctx.db(async (tx) => {
      const fresh = await gate(tx, ctx)
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.tenantId + ':financial:' + value.idempotencyKey},0))`,
      )
      const existing = (
        await tx.execute(sql`SELECT r.id,f.*,d.sha256,d.filename FROM approval_requests r
        JOIN approval_financial_sources f ON f.tenant_id=r.tenant_id AND f.property_id=r.property_id AND f.id=r.source_id
        JOIN audit_log initial ON initial.tenant_id=r.tenant_id AND initial.dedup_key='approval-financial-document:'||r.creation_key::text
        JOIN approval_documents d ON d.tenant_id=f.tenant_id AND d.property_id=f.property_id AND d.source_id=f.id AND d.id::text=initial.metadata->>'documentId'
        WHERE r.tenant_id=${ctx.tenantId} AND r.creation_key=${value.idempotencyKey} ORDER BY d.created_at,d.id LIMIT 1`)
      )[0]
      if (existing) {
        await permission(tx, ctx, fresh, 'approvals.submit', text(existing, 'property_id'))
        if (
          existing.requester_id !== ctx.membership!.id ||
          existing.title !== value.title ||
          existing.category !== value.category ||
          amountMinor(text(existing, 'amount')) !== amountMinor(value.amount) ||
          existing.currency !== value.currency ||
          existing.supplier !== value.supplier ||
          existing.description !== value.description ||
          existing.sha256 !== digest ||
          existing.filename !== filename
        )
          throw new Error('Idempotency key conflicts with another request')
        const prior = (
          await tx.execute(
            sql`SELECT id,workflow_id FROM approval_requests WHERE tenant_id=${ctx.tenantId} AND creation_key=${value.idempotencyKey}`,
          )
        )[0]!
        if (prior.workflow_id !== value.workflowId)
          throw new Error('Idempotency key conflicts with another workflow')
        return { id: text(prior, 'id') }
      }
      const w = (
        await tx.execute(sql`SELECT w.*,r.category,r.currency,r.maximum_amount FROM approval_workflows w
        JOIN approval_workflow_rules r ON r.tenant_id=w.tenant_id AND r.property_id=w.property_id AND r.workflow_id=w.id
        WHERE w.tenant_id=${ctx.tenantId} AND w.id=${value.workflowId} AND w.active=true`)
      )[0]
      if (!w) throw new Error('Production workflow unavailable')
      const propertyId = text(w, 'property_id')
      await property(tx, ctx, fresh, propertyId)
      await permission(tx, ctx, fresh, 'approvals.submit', propertyId)
      if (
        w.category !== value.category ||
        w.currency !== value.currency ||
        amountMinor(value.amount) > amountMinor(text(w, 'maximum_amount'))
      )
        throw new Error('Request exceeds workflow category, currency or amount authority')
      for (const stage of w.stages as Array<Record<string, unknown>>)
        await financialAuthority(tx, ctx, String(stage.approverId), propertyId, stage, value.amount)
      const sourceId = randomUUID(),
        documentId = randomUUID()
      await tx.execute(sql`INSERT INTO approval_financial_sources(id,tenant_id,property_id,requester_id,title,category,amount,currency,supplier,description)
        VALUES(${sourceId},${ctx.tenantId},${propertyId},${ctx.membership!.id},${value.title},${value.category},${value.amount},${value.currency},${value.supplier},${value.description})`)
      await putObject({ key, body: file.bytes, contentType, contentDisposition: 'attachment' })
      uploaded = true
      await tx.execute(sql`INSERT INTO approval_documents(id,tenant_id,property_id,source_id,uploader_id,filename,object_key,content_type,byte_size,sha256)
        VALUES(${documentId},${ctx.tenantId},${propertyId},${sourceId},${ctx.membership!.id},${filename},${key},${contentType},${file.bytes.byteLength},${digest})`)
      const result = await submitApprovalRequest(
        nested(ctx, tx),
        {
          workflowId: value.workflowId,
          source: { module: 'financial', id: sourceId, version: '1' },
          idempotencyKey: value.idempotencyKey,
        },
        {
          financial: {
            module: 'financial',
            resolve: async (db, context, source) => {
              const row = (
                await db.execute(
                  sql`SELECT * FROM approval_financial_sources WHERE tenant_id=${context.tenantId} AND id=${source.id} AND requester_id=${context.membership!.id}`,
                )
              )[0]
              if (!row || source.version !== '1') throw new Error('Financial source unavailable')
              return {
                propertyId: text(row, 'property_id'),
                title: text(row, 'title'),
                version: '1',
              }
            },
          },
        },
      )
      await recordAuditInTransaction(tx, ctx, {
        entityType: 'approval_request',
        entityId: result.id,
        action: 'create',
        summary: 'Approval document attached',
        dedupKey: 'approval-financial-document:' + value.idempotencyKey,
        metadata: { propertyId, documentId, sha256: digest },
      })
      const request = (
        await tx.execute(
          sql`SELECT * FROM approval_requests WHERE tenant_id=${ctx.tenantId} AND id=${result.id}`,
        )
      )[0]!
      await notify(tx, ctx, request, value.idempotencyKey)
      return result
    })
  } catch (error) {
    if (uploaded) await deleteObject({ key }).catch(() => undefined)
    throw error
  }
}

export async function configureProductionWorkflow(ctx: RequestContext, input: unknown) {
  const v = productionWorkflowInput.parse(input)
  if (!v.emailEnabled && !v.inAppEnabled)
    throw new Error('Enable at least one notification channel')
  return ctx.db(async (tx) => {
    const fresh = await gate(tx, ctx)
    await property(tx, ctx, fresh, v.propertyId)
    await permission(tx, ctx, fresh, 'approvals.configure', v.propertyId)
    for (const stage of v.stages)
      await financialAuthority(tx, ctx, stage.approverId, v.propertyId, stage, v.maximumAmount)
    const result = await createApprovalWorkflow(nested(ctx, tx), {
      propertyId: v.propertyId,
      name: v.name,
      stages: v.stages,
    })
    await tx.execute(sql`INSERT INTO approval_workflow_rules(tenant_id,property_id,workflow_id,category,currency,maximum_amount,reminder_hours,email_enabled,in_app_enabled)
      VALUES(${ctx.tenantId},${v.propertyId},${result.id},${v.category},${v.currency},${v.maximumAmount},${v.reminderHours},${v.emailEnabled},${v.inAppEnabled})`)
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'approval_workflow',
      entityId: result.id,
      action: 'create',
      summary: 'Approval authority configured',
      metadata: {
        propertyId: v.propertyId,
        category: v.category,
        currency: v.currency,
        maximumAmount: v.maximumAmount,
        reminderHours: v.reminderHours,
      },
    })
    return result
  })
}

export async function approvalActivity(ctx: RequestContext, input: unknown) {
  const v = activityInput.parse(input)
  return ctx.db(async (tx) => {
    const { request: r, fresh } = await readable(tx, ctx, v.requestId, true)
    const prior = (
      await tx.execute(
        sql`SELECT * FROM approval_activity WHERE tenant_id=${ctx.tenantId} AND idempotency_key=${v.idempotencyKey}`,
      )
    )[0]
    if (prior) {
      if (
        prior.request_id !== v.requestId ||
        prior.actor_id !== ctx.membership!.id ||
        prior.kind !== v.kind ||
        prior.body !== v.body ||
        (prior.target_id ?? undefined) !== v.targetId ||
        Number(prior.position) !== v.stage ||
        Number(prior.assignment_version) !== v.assignmentVersion + (v.kind === 'delegate' ? 1 : 0)
      )
        throw new Error('Idempotency key conflicts with another action')
      return { id: text(prior, 'id') }
    }
    if (Number(r.current_stage) !== v.stage || Number(r.assignment_version) !== v.assignmentVersion)
      throw new Error('Request changed; refresh before continuing')
    const propertyId = text(r, 'property_id')
    const owner = r.requester_id === ctx.membership!.id
    const assigned = r.assignee_id === ctx.membership!.id && !owner
    if (v.kind === 'cancel' || v.kind === 'resubmit') {
      if (!owner) throw new Error('Only the requester can perform this action')
      await permission(tx, ctx, fresh, 'approvals.submit', propertyId)
    } else if (v.kind === 'delegate' || v.kind === 'more_info') {
      if (!assigned) throw new Error('Only the current approver can perform this action')
      await permission(tx, ctx, fresh, 'approvals.decide', propertyId)
    } else if (v.kind === 'remind') {
      if (!owner && !assigned) throw new Error('Only the requester or current approver can remind')
      await permission(tx, ctx, fresh, owner ? 'approvals.submit' : 'approvals.decide', propertyId)
      const recent = await tx.execute(
        sql`SELECT id FROM approval_activity WHERE tenant_id=${ctx.tenantId} AND request_id=${r.id} AND kind='remind' AND created_at>now()-interval '1 hour'`,
      )
      if (recent.length) throw new Error('A reminder was sent within the last hour')
    }
    if (assigned && ['delegate', 'more_info'].includes(v.kind) && r.source_module === 'financial') {
      const row = (
        await tx.execute(
          sql`SELECT w.stages,f.amount FROM approval_workflows w JOIN approval_financial_sources f ON f.tenant_id=w.tenant_id AND f.property_id=w.property_id WHERE w.tenant_id=${ctx.tenantId} AND w.id=${r.workflow_id} AND f.id=${r.source_id}`,
        )
      )[0]!
      await financialAuthority(
        tx,
        ctx,
        ctx.membership!.id,
        propertyId,
        (row.stages as Array<Record<string, unknown>>)[v.stage - 1]!,
        String(row.amount),
        ctx.activeRoleId,
      )
    }
    if (v.kind === 'delegate') {
      if (v.targetId === ctx.membership!.id || v.targetId === r.requester_id)
        throw new Error('Cannot delegate to yourself or the requester')
      await approver(tx, ctx, v.targetId!, propertyId)
      if (r.source_module === 'financial') {
        const w = (
          await tx.execute(
            sql`SELECT w.stages,f.amount FROM approval_workflows w JOIN approval_financial_sources f ON f.tenant_id=w.tenant_id AND f.property_id=w.property_id WHERE w.tenant_id=${ctx.tenantId} AND w.id=${r.workflow_id} AND f.id=${r.source_id}`,
          )
        )[0]!
        await financialAuthority(
          tx,
          ctx,
          v.targetId!,
          propertyId,
          (w.stages as Array<Record<string, unknown>>)[v.stage - 1]!,
          String(w.amount),
        )
      }
    }
    const id = randomUUID(),
      auditKey = 'approval-activity:' + v.idempotencyKey
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'approval_request',
      entityId: v.requestId,
      action: 'update',
      summary: 'Approval activity recorded',
      dedupKey: auditKey,
      metadata: {
        propertyId,
        activityId: id,
        kind: v.kind,
        bodyDigest: createHash('sha256').update(v.body).digest('hex'),
      },
    })
    const a = (
      await tx.execute(
        sql`SELECT id FROM audit_log WHERE tenant_id=${ctx.tenantId} AND dedup_key=${auditKey}`,
      )
    )[0]
    if (!a) throw new Error('Approval audit missing')
    await tx.execute(sql`INSERT INTO approval_activity(id,tenant_id,property_id,request_id,actor_id,target_id,position,kind,body,idempotency_key,assignment_version,audit_id,audit_key,audit_snapshot)
      VALUES(${id},${ctx.tenantId},${propertyId},${r.id},${ctx.membership!.id},${v.targetId ?? null},${v.stage},${v.kind},${v.body},${v.idempotencyKey},${v.assignmentVersion + (v.kind === 'delegate' ? 1 : 0)},${a.id},${auditKey},'{}'::jsonb)`)
    await notify(tx, ctx, r, id)
    return { id }
  })
}

export async function productionDecision(ctx: RequestContext, input: unknown) {
  const value = decisionInput.parse(input)
  return ctx.db(async (tx) => {
    const { request } = await readable(tx, ctx, value.requestId, true)
    if (request.source_module === 'financial') {
      const w = (
        await tx.execute(
          sql`SELECT w.stages,f.amount FROM approval_workflows w JOIN approval_financial_sources f ON f.tenant_id=w.tenant_id AND f.property_id=w.property_id WHERE w.tenant_id=${ctx.tenantId} AND w.id=${request.workflow_id} AND f.id=${request.source_id}`,
        )
      )[0]!
      await financialAuthority(
        tx,
        ctx,
        ctx.membership!.id,
        text(request, 'property_id'),
        (w.stages as Array<Record<string, unknown>>)[value.stage - 1]!,
        String(w.amount),
        ctx.activeRoleId,
      )
    }
    const result = await decideApproval(nested(ctx, tx), value)
    const r = (
      await tx.execute(
        sql`SELECT * FROM approval_requests WHERE tenant_id=${ctx.tenantId} AND id=${value.requestId}`,
      )
    )[0]!
    await notify(tx, ctx, r, result.id)
    return result
  })
}

export async function productionDetail(
  ctx: RequestContext,
  id: string,
  section: 'timeline' | 'comments' | 'documents',
  q: string,
  page: number,
) {
  return ctx.db(async (tx) => {
    const { request: r, fresh } = await readable(tx, ctx, id)
    const financial =
      (
        await tx.execute(sql`SELECT f.*,p.name AS property_name,coalesce(u.display_name,account.name) AS creator
      FROM approval_financial_sources f JOIN hospitality_properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
      JOIN tenant_users u ON u.tenant_id=f.tenant_id AND u.id=f.requester_id JOIN "user" account ON account.id=u.user_id
      WHERE f.tenant_id=${ctx.tenantId} AND f.id=${r.source_id} AND f.property_id=${r.property_id}`)
      )[0] ?? {}
    const stages = await tx.execute(
      sql`SELECT s.*,coalesce(u.display_name,account.name) AS approver FROM approval_stages s JOIN tenant_users u ON u.tenant_id=s.tenant_id AND u.id=s.approver_id JOIN "user" account ON account.id=u.user_id WHERE s.tenant_id=${ctx.tenantId} AND s.request_id=${id} ORDER BY s.position`,
    )
    const currentApprover =
      (
        await tx.execute(
          sql`SELECT coalesce(u.display_name,a.name) AS name FROM tenant_users u JOIN "user" a ON a.id=u.user_id WHERE u.tenant_id=${ctx.tenantId} AND u.id=${r.assignee_id}`,
        )
      )[0]?.name ?? ''
    const search = '%' + q + '%'
    const relation =
      section === 'documents'
        ? sql`SELECT d.id,d.filename AS body,'document' AS kind,d.created_at AS occurred_at,coalesce(u.display_name,account.name) AS actor
      FROM approval_documents d JOIN tenant_users u ON u.tenant_id=d.tenant_id AND u.id=d.uploader_id JOIN "user" account ON account.id=u.user_id
      WHERE d.tenant_id=${ctx.tenantId} AND d.property_id=${r.property_id} AND d.source_id=${r.source_id}`
        : section === 'comments'
          ? sql`SELECT a.id,a.body,a.kind,a.created_at AS occurred_at,coalesce(u.display_name,account.name) AS actor FROM approval_activity a
      JOIN tenant_users u ON u.tenant_id=a.tenant_id AND u.id=a.actor_id JOIN "user" account ON account.id=u.user_id WHERE a.tenant_id=${ctx.tenantId} AND a.request_id=${id} AND a.kind='comment'`
          : sql`SELECT a.id,a.body,a.kind,a.created_at AS occurred_at,coalesce(u.display_name,account.name) AS actor FROM approval_activity a
      JOIN tenant_users u ON u.tenant_id=a.tenant_id AND u.id=a.actor_id JOIN "user" account ON account.id=u.user_id WHERE a.tenant_id=${ctx.tenantId} AND a.request_id=${id}
      UNION ALL SELECT e.id,coalesce(e.evidence->>'reason','') AS body,e.kind,e.occurred_at,coalesce(u.display_name,account.name) AS actor FROM approval_events e
      JOIN tenant_users u ON u.tenant_id=e.tenant_id AND u.id=e.actor_id JOIN "user" account ON account.id=u.user_id WHERE e.tenant_id=${ctx.tenantId} AND e.request_id=${id}`
    const rows = await tx.execute(
      sql`SELECT * FROM (${relation}) items WHERE (body ILIKE ${search} OR kind ILIKE ${search} OR actor ILIKE ${search}) ORDER BY occurred_at DESC,id DESC LIMIT 25 OFFSET ${(page - 1) * 25}`,
    )
    const count = (
      await tx.execute(
        sql`SELECT count(*) AS total FROM (${relation}) items WHERE (body ILIKE ${search} OR kind ILIKE ${search} OR actor ILIKE ${search})`,
      )
    )[0]
    return {
      request: r,
      currentApprover,
      financial,
      stages,
      rows,
      total: Number(count?.total ?? 0),
      permissions: [...fresh.permissions],
    }
  })
}

export async function productionOptions(
  ctx: RequestContext,
  configure = false,
  filters = { q: '', page: 1 },
) {
  return ctx.db(async (tx) => {
    const fresh = await gate(tx, ctx)
    const propertyIds = await approvalPropertyIds(
      tx,
      ctx,
      fresh,
      configure ? 'approvals.configure' : 'approvals.submit',
    )
    const scope = sql`SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(propertyIds)}::jsonb)`
    const properties = await tx.execute(
      sql`SELECT id,name FROM hospitality_properties WHERE tenant_id=${ctx.tenantId} AND id IN (${scope}) ORDER BY name,id`,
    )
    const workflows =
      await tx.execute(sql`SELECT w.id,w.property_id,w.name,w.stages,r.category,r.currency,r.maximum_amount,r.reminder_hours FROM approval_workflows w
      JOIN approval_workflow_rules r ON r.tenant_id=w.tenant_id AND r.property_id=w.property_id AND r.workflow_id=w.id
      WHERE w.tenant_id=${ctx.tenantId} AND w.property_id IN (${scope}) AND w.active=true
      AND (w.name ILIKE ${'%' + filters.q + '%'} OR r.category ILIKE ${'%' + filters.q + '%'})
      ORDER BY w.created_at DESC,w.id LIMIT ${configure ? 25 : 500} OFFSET ${configure ? (filters.page - 1) * 25 : 0}`)
    const count = configure
      ? (
          await tx.execute(
            sql`SELECT count(*) AS total FROM approval_workflows w JOIN approval_workflow_rules r ON r.tenant_id=w.tenant_id AND r.property_id=w.property_id AND r.workflow_id=w.id WHERE w.tenant_id=${ctx.tenantId} AND w.property_id IN (${scope}) AND w.active=true AND (w.name ILIKE ${'%' + filters.q + '%'} OR r.category ILIKE ${'%' + filters.q + '%'})`,
          )
        )[0]
      : undefined
    // Configuration can search the existing tenant membership; final authority is rechecked at save.
    const members = configure
      ? await tx.execute(
          sql`SELECT u.id,coalesce(u.display_name,a.name) AS display_name FROM tenant_users u JOIN "user" a ON a.id=u.user_id WHERE u.tenant_id=${ctx.tenantId} AND u.status='active' ORDER BY display_name,u.id LIMIT 500`,
        )
      : []
    const roles = configure
      ? await tx.execute(
          sql`SELECT id,name FROM roles WHERE tenant_id=${ctx.tenantId} ORDER BY name,id LIMIT 500`,
        )
      : []
    return {
      properties,
      workflows,
      members,
      roles,
      workflowsTotal: Number(count?.total ?? workflows.length),
    }
  })
}

export async function productionList(
  ctx: RequestContext,
  filters: {
    view: string
    q: string
    status: string
    propertyId: string
    page: number
    perPage: number
  },
) {
  return ctx.db(async (tx) => {
    const { fresh, propertyIds } = await approvalReadScope(tx, ctx)
    const teamIds = await teamPropertyIds(tx, ctx, fresh)
    if (['team', 'reports', 'history'].includes(filters.view) && !teamIds.length)
      throw new Error('Team approval authority required')
    const propertyFilter = filters.propertyId ? uuid.parse(filters.propertyId) : null
    const scope = sql`SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(propertyIds)}::jsonb)`
    const teamScope = sql`SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(teamIds)}::jsonb)`
    const assignee = sql`approval_effective_assignee(r.tenant_id,r.property_id,r.id,r.current_stage)`
    const where = sql`r.tenant_id=${ctx.tenantId} AND r.property_id IN (${scope})
      AND (r.requester_id=${ctx.membership!.id} OR ${assignee}=${ctx.membership!.id} OR r.property_id IN (${teamScope}))
      AND (${filters.view}<>'my' OR r.requester_id=${ctx.membership!.id})
      AND (${filters.view}<>'awaiting' OR (r.status='pending' AND ${assignee}=${ctx.membership!.id}))
      AND (${!['team', 'reports', 'history'].includes(filters.view)} OR r.property_id IN (${teamScope}))
      AND (${propertyFilter}::uuid IS NULL OR r.property_id=${propertyFilter}::uuid)
      AND (${filters.status}='' OR r.status=${filters.status})
      AND (r.title ILIKE ${'%' + filters.q + '%'} OR f.category ILIKE ${'%' + filters.q + '%'} OR f.supplier ILIKE ${'%' + filters.q + '%'})`
    const from = sql`FROM approval_requests r LEFT JOIN approval_financial_sources f ON f.tenant_id=r.tenant_id AND f.property_id=r.property_id AND f.id=r.source_id
      JOIN hospitality_properties p ON p.tenant_id=r.tenant_id AND p.id=r.property_id`
    const rows =
      await tx.execute(sql`SELECT r.id,r.title,r.status,r.created_at,r.current_stage,r.stage_count,f.category,f.amount,f.currency,f.supplier,p.name AS property_name ${from} WHERE ${where}
      ORDER BY r.created_at DESC,r.id DESC LIMIT ${filters.perPage} OFFSET ${(filters.page - 1) * filters.perPage}`)
    const totals = await tx.execute(
      sql`SELECT r.status,count(*) AS total,f.currency,coalesce(sum(f.amount),0) AS amount ${from} WHERE ${where} GROUP BY r.status,f.currency ORDER BY r.status,f.currency`,
    )
    const breakdown =
      filters.view === 'reports'
        ? await tx.execute(
            sql`SELECT p.name AS property_name,f.category,f.currency,r.status,count(*) AS total,sum(f.amount) AS amount ${from} WHERE ${where} GROUP BY p.name,f.category,f.currency,r.status ORDER BY p.name,f.category,f.currency,r.status LIMIT 500`,
          )
        : []
    const properties = await tx.execute(
      sql`SELECT id,name FROM hospitality_properties WHERE tenant_id=${ctx.tenantId} AND id IN (${scope}) ORDER BY name,id`,
    )
    return {
      rows,
      totals,
      breakdown,
      properties,
      total: totals.reduce((sum, r) => sum + Number(r.total), 0),
    }
  })
}

export async function downloadApprovalDocument(
  ctx: RequestContext,
  requestId: string,
  documentId: string,
) {
  return ctx.db(async (tx) => {
    const { request: r } = await readable(tx, ctx, requestId)
    const d = (
      await tx.execute(
        sql`SELECT * FROM approval_documents WHERE tenant_id=${ctx.tenantId} AND property_id=${r.property_id} AND source_id=${r.source_id} AND id=${uuid.parse(documentId)}`,
      )
    )[0]
    if (!d) throw new Error('Document unavailable')
    const key = text(d, 'object_key')
    assertTenantObjectKey({ tenantId: ctx.tenantId, key })
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'approval_request',
      entityId: requestId,
      action: 'export',
      summary: 'Approval document downloaded',
      metadata: { propertyId: r.property_id, documentId },
    })
    const bytes = await getObject({ key })
    if (
      bytes.length !== Number(d.byte_size) ||
      createHash('sha256').update(bytes).digest('hex') !== d.sha256
    )
      throw new Error('Document integrity check failed')
    return { bytes, filename: text(d, 'filename'), contentType: text(d, 'content_type') }
  })
}

export async function productionDelegates(ctx: RequestContext, requestId: string) {
  return ctx.db(async (tx) => {
    const { request: r, fresh } = await readable(tx, ctx, requestId)
    if (r.assignee_id !== ctx.membership!.id || r.status !== 'pending') return []
    await permission(tx, ctx, fresh, 'approvals.decide', text(r, 'property_id'))
    const members = await tx.execute(
      sql`SELECT u.id,coalesce(u.display_name,a.name) AS display_name FROM tenant_users u JOIN "user" a ON a.id=u.user_id WHERE u.tenant_id=${ctx.tenantId} AND u.status='active' AND u.id NOT IN (${ctx.membership!.id},${r.requester_id}) ORDER BY display_name,u.id LIMIT 500`,
    )
    const eligible: Array<{ id: string; name: string }> = []
    for (const m of members) {
      try {
        await approver(tx, ctx, text(m, 'id'), text(r, 'property_id'))
        if (r.source_module === 'financial') {
          const row = (
            await tx.execute(
              sql`SELECT w.stages,f.amount FROM approval_workflows w JOIN approval_financial_sources f ON f.tenant_id=w.tenant_id AND f.property_id=w.property_id WHERE w.tenant_id=${ctx.tenantId} AND w.id=${r.workflow_id} AND f.id=${r.source_id}`,
            )
          )[0]!
          await financialAuthority(
            tx,
            ctx,
            text(m, 'id'),
            text(r, 'property_id'),
            (row.stages as Array<Record<string, unknown>>)[Number(r.current_stage) - 1]!,
            String(row.amount),
          )
        }
        eligible.push({ id: text(m, 'id'), name: text(m, 'display_name') || text(m, 'id') })
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !/(Missing permission|not assigned for this property|not an active tenant member|cannot access this property|configured financial role authority)/.test(
            error.message,
          )
        )
          throw error
      }
    }
    return eligible
  })
}

export async function attachApprovalDocument(
  ctx: RequestContext,
  input: unknown,
  file: { name: string; bytes: Uint8Array },
) {
  const v = attachmentInput.parse(input)
  if (file.bytes.byteLength < 1 || file.bytes.byteLength > 10 * 1024 * 1024)
    throw new Error('Document must be at most 10 MB')
  const contentType = documentType(file.bytes),
    filename = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 200)
  if (!filename) throw new Error('Document filename is required')
  const digest = createHash('sha256').update(file.bytes).digest('hex')
  const key = newTenantObjectKey({ tenantId: ctx.tenantId, scope: 'approvals', filename })
  let uploaded = false
  try {
    return await ctx.db(async (tx) => {
      const { request: r, fresh } = await readable(tx, ctx, v.requestId, true)
      await permission(tx, ctx, fresh, 'approvals.submit', text(r, 'property_id'))
      if (r.requester_id !== ctx.membership!.id || r.source_module !== 'financial')
        throw new Error('Only the financial requester can attach documents')
      const auditKey = 'approval-document:' + v.idempotencyKey
      const previous = (
        await tx.execute(
          sql`SELECT metadata FROM audit_log WHERE tenant_id=${ctx.tenantId} AND dedup_key=${auditKey}`,
        )
      )[0]
      if (previous) {
        const m = previous.metadata as Record<string, unknown>
        if (
          m.requestId !== v.requestId ||
          m.sha256 !== digest ||
          m.filenameDigest !== createHash('sha256').update(filename).digest('hex')
        )
          throw new Error('Idempotency key conflicts with another document')
        return { id: String(m.documentId) }
      }
      if (!['pending', 'more_info'].includes(text(r, 'status')))
        throw new Error('Resolved request evidence cannot be extended')
      const id = randomUUID()
      await putObject({ key, body: file.bytes, contentType, contentDisposition: 'attachment' })
      uploaded = true
      await tx.execute(
        sql`INSERT INTO approval_documents(id,tenant_id,property_id,source_id,uploader_id,filename,object_key,content_type,byte_size,sha256) VALUES(${id},${ctx.tenantId},${r.property_id},${r.source_id},${ctx.membership!.id},${filename},${key},${contentType},${file.bytes.byteLength},${digest})`,
      )
      await recordAuditInTransaction(tx, ctx, {
        entityType: 'approval_request',
        entityId: v.requestId,
        action: 'update',
        summary: 'Approval document attached',
        dedupKey: auditKey,
        metadata: {
          propertyId: r.property_id,
          requestId: v.requestId,
          documentId: id,
          sha256: digest,
          filenameDigest: createHash('sha256').update(filename).digest('hex'),
        },
      })
      await approvalActivity(nested(ctx, tx), {
        requestId: v.requestId,
        kind: 'comment',
        body: 'Document attached: ' + filename,
        stage: Number(r.current_stage),
        assignmentVersion: Number(r.assignment_version),
        idempotencyKey: v.idempotencyKey,
      })
      return { id }
    })
  } catch (error) {
    if (uploaded) await deleteObject({ key }).catch(() => undefined)
    throw error
  }
}

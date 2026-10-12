// Existing isolated fixture only. All synthetic data is rolled back. No DDL.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@beaconhs/db/client'
import type { Database } from '@beaconhs/db'
import { readPreviewCollections } from '../src/lib/approvals/preview-queries'
import { sql } from 'drizzle-orm'
import { can, canSeeProperty, resolveMembershipAccess, type RequestContext } from '@beaconhs/tenant'
import {
  createApprovalWorkflow,
  submitApprovalRequest,
  decideApproval,
  readApprovalRequest,
} from '../src/lib/approvals/service'

const url = process.env.PEOPLE_PROVENANCE_TEST_DATABASE_URL
assert.equal(process.env.CI, 'true')
assert.equal(url, 'postgresql://postgres:postgres@localhost:5432/beaconhs_test')
const db = createClient({ url, max: 1 })
const rollback = new Error('ROLLBACK_SYNTHETIC_SECURITY_TESTS')
let passed = 0
async function test(name: string, fn: () => Promise<void>) {
  await fn()
  passed++
  console.log(`PASS ${name}`)
}
try {
  await db.db.transaction(async (tx) => {
    const check = await tx.execute(sql`SELECT current_database() AS db`)
    assert.equal(check[0]?.db, 'beaconhs_test')
    const ledger = await tx.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)
    assert.equal(ledger[0]?.n, 62)
    const tenant = randomUUID(),
      a = randomUUID(),
      b = randomUUID(),
      foreign = randomUUID()
    const member = randomUUID(),
      actor = randomUUID(),
      user = randomUUID(),
      actorUser = randomUUID()
    const privileged = randomUUID(),
      unrelated = randomUUID(),
      reviewer = randomUUID()
    const permissions = [
      'approvals.read',
      'approvals.submit',
      'approvals.configure',
      'approvals.decide',
    ]
    await tx.execute(
      sql`INSERT INTO tenants(id,slug,name) VALUES(${tenant},${tenant},'Rollback-only Approvals security test')`,
    )
    await tx.execute(
      sql`INSERT INTO tenant_module_entitlements(tenant_id,module_key,state) VALUES(${tenant},'approvals','enabled')`,
    )
    for (const property of [a, b])
      await tx.execute(
        sql`INSERT INTO hospitality_properties(id,tenant_id,name,code,timezone) VALUES(${property},${tenant},'Synthetic property',${property},'UTC')`,
      )
    for (const [id, uid] of [
      [member, user],
      [actor, actorUser],
    ]) {
      await tx.execute(
        sql`INSERT INTO "user"(id,email,name) VALUES(${uid!},${uid! + '@example.invalid'},'Synthetic security test')`,
      )
      await tx.execute(
        sql`INSERT INTO tenant_users(id,tenant_id,user_id,status) VALUES(${id!},${tenant},${uid!},'active')`,
      )
    }
    for (const [id, perms] of [
      [privileged, permissions],
      [unrelated, ['approvals.read']],
      [reviewer, ['approvals.read', 'approvals.decide']],
    ] as const)
      await tx.execute(
        sql`INSERT INTO roles(id,tenant_id,key,name,permissions) VALUES(${id},${tenant},${id},'Rollback role',${JSON.stringify(perms)}::jsonb)`,
      )
    for (const [id, role, property] of [
      [member, privileged, a],
      [member, unrelated, b],
      [actor, reviewer, a],
    ])
      await tx.execute(
        sql`INSERT INTO role_assignments(tenant_id,tenant_user_id,role_id,scope) VALUES(${tenant},${id!},${role!},${JSON.stringify({ type: 'properties', propertyIds: [property] })}::jsonb)`,
      )
    await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
    await tx.execute(
      sql`SELECT set_config('app.tenant_id',${tenant},true),set_config('app.action_scope_mode','property',true),set_config('app.action_property_ids',${JSON.stringify([a, b])},true)`,
    )
    const role = await tx.execute(
      sql`SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`,
    )
    assert.equal(role[0]?.name, 'beaconhs_app')
    assert.equal(role[0]?.rolsuper, false)
    assert.equal(role[0]?.rolbypassrls, false)
    const ctx: RequestContext = {
      tenantId: tenant,
      userId: user,
      isSuperAdmin: false,
      membership: { id: member, displayName: 'Fixture' },
      personId: null,
      permissions: new Set(permissions),
      scopes: [{ type: 'properties', propertyIds: [a, b] }],
      timezone: 'UTC',
      locale: 'en',
      defaultLocale: 'en',
      enabledLocales: ['en'],
      localeOverride: null,
      // Match withTenant's transaction executor adaptation; never use the root client.
      db: (fn) => fn(tx as unknown as Database),
    }
    const actorCtx = {
      ...ctx,
      userId: actorUser,
      membership: { id: actor, displayName: 'Reviewer' },
    }
    const workflow = (propertyId: string) => ({
      propertyId,
      name: 'Immutable test version',
      stages: [{ name: 'Review', approverId: actor }],
    })
    await test('Reproduces canonical mixed-role scope combination without changing global RBAC', async () => {
      const resolved = await resolveMembershipAccess(tx as unknown as Database, member)
      const combined = { ...ctx, ...resolved }
      assert.equal(can(combined, 'approvals.configure') && canSeeProperty(combined, b), true)
    })
    await test('Mixed roles cannot configure Property B using Property A permission', async () => {
      await assert.rejects(
        () => createApprovalWorkflow(ctx, workflow(b)),
        /not assigned for this property/,
      )
    })
    const w = await createApprovalWorkflow(ctx, workflow(a))
    await test('Same-assignment Property A permission succeeds', async () => {
      assert.ok(w.id)
    })
    await test('Foreign property denied', async () => {
      await assert.rejects(
        () => createApprovalWorkflow(ctx, workflow(foreign)),
        /Property access denied/,
      )
    })
    await test('Selected unrelated role cannot borrow privileged role permission', async () => {
      await assert.rejects(
        () => createApprovalWorkflow({ ...ctx, activeRoleId: unrelated }, workflow(a)),
        /Property access denied|Missing permission|not assigned/,
      )
    })
    await test('Unscoped override cannot elevate unrelated Property B role', async () => {
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(
        sql`INSERT INTO user_permission_overrides(tenant_id,tenant_user_id,permission,effect) VALUES(${tenant},${member},'approvals.configure','grant')`,
      )
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
      await assert.rejects(
        () => createApprovalWorkflow(ctx, workflow(b)),
        /not assigned for this property/,
      )
    })
    const adapters = {
      tasks: {
        module: 'tasks' as const,
        resolve: async () => ({ propertyId: a, title: 'Rollback submission', version: '1' }),
      },
    }
    const request = await submitApprovalRequest(
      ctx,
      {
        workflowId: w.id,
        source: { module: 'tasks', id: randomUUID(), version: '1' },
        idempotencyKey: randomUUID(),
      },
      adapters,
    )
    // Prepare B through the real engine, then revoke that authority before reads.
    await tx.execute(sql`RESET ROLE`)
    await tx.execute(
      sql`UPDATE role_assignments SET scope=${JSON.stringify({ type: 'properties', propertyIds: [a, b] })}::jsonb WHERE role_id IN (${privileged},${reviewer})`,
    )
    await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
    const wb = await createApprovalWorkflow(ctx, workflow(b))
    const requestB = await submitApprovalRequest(
      ctx,
      {
        workflowId: wb.id,
        source: { module: 'tasks', id: randomUUID(), version: '1' },
        idempotencyKey: randomUUID(),
      },
      {
        tasks: {
          module: 'tasks',
          resolve: async () => ({ propertyId: b, title: 'Forbidden B request', version: '1' }),
        },
      },
    )
    await tx.execute(sql`RESET ROLE`)
    await tx.execute(
      sql`UPDATE role_assignments SET scope=${JSON.stringify({ type: 'properties', propertyIds: [a] })}::jsonb WHERE role_id IN (${privileged},${reviewer})`,
    )
    await tx.execute(
      sql`UPDATE roles SET permissions='["documents.read"]'::jsonb WHERE id=${unrelated}`,
    )
    await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
    await test('Actual collection SQL excludes B requests and workflows for mixed roles', async () => {
      const data = await readPreviewCollections(ctx)
      assert.deepEqual(
        data.requests.map((r) => r.id),
        [request.id],
      )
      assert.ok(!data.workflows.some((w) => w.id === wb.id))
      assert.deepEqual(data.configurePropertyIds, [a])
      await assert.rejects(() => readApprovalRequest(ctx, requestB.id), /unavailable/)
    })
    await test('Unscoped read override cannot expose B collections or detail', async () => {
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(
        sql`INSERT INTO user_permission_overrides(tenant_id,tenant_user_id,permission,effect) VALUES(${tenant},${member},'approvals.read','grant')`,
      )
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
      assert.deepEqual(
        (await readPreviewCollections(ctx)).requests.map((r) => r.id),
        [request.id],
      )
      await assert.rejects(() => readApprovalRequest(ctx, requestB.id), /unavailable/)
    })
    await test('Read deny and suspended requester block collections and detail with stale context', async () => {
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(
        sql`UPDATE user_permission_overrides SET effect='deny' WHERE tenant_user_id=${member} AND permission='approvals.read'`,
      )
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
      await assert.rejects(() => readPreviewCollections(ctx), /Missing permission/)
      await assert.rejects(() => readApprovalRequest(ctx, request.id), /Missing permission/)
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(
        sql`UPDATE user_permission_overrides SET effect='grant' WHERE tenant_user_id=${member} AND permission='approvals.read'`,
      )
      await tx.execute(sql`UPDATE tenant_users SET status='suspended' WHERE id=${member}`)
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
      await assert.rejects(() => readPreviewCollections(ctx), /Active membership/)
      await assert.rejects(() => readApprovalRequest(ctx, request.id), /Active membership/)
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(sql`UPDATE tenant_users SET status='active' WHERE id=${member}`)
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
    })
    await test('Forged foreign tenant context cannot read collections or detail', async () => {
      await assert.rejects(() => readPreviewCollections({ ...ctx, tenantId: foreign }), /disabled/)
      await assert.rejects(
        () => readApprovalRequest({ ...ctx, tenantId: foreign }, request.id),
        /disabled/,
      )
    })
    await test('User without configure permission cannot create workflows', async () => {
      await assert.rejects(
        () => createApprovalWorkflow(actorCtx, workflow(a)),
        /Missing permission/,
      )
    })
    await tx.execute(sql`RESET ROLE`)
    await tx.execute(
      sql`UPDATE roles SET permissions='["approvals.read"]'::jsonb WHERE id=${unrelated}`,
    )
    await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
    await test('Request stages survive creation of another workflow version', async () => {
      await createApprovalWorkflow(ctx, {
        ...workflow(a),
        name: 'New two-stage version',
        stages: [
          { name: 'First', approverId: actor },
          { name: 'Second', approverId: actor },
        ],
      })
      const detail = await readApprovalRequest(ctx, request.id)
      assert.equal(detail.stages.length, 1)
    })
    await test('Suspended approver denied despite stale context', async () => {
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(sql`UPDATE tenant_users SET status='suspended' WHERE id=${actor}`)
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
      await assert.rejects(
        () =>
          decideApproval(actorCtx, {
            requestId: request.id,
            stage: 1,
            decision: 'approve',
            idempotencyKey: randomUUID(),
          }),
        /Active membership required/,
      )
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(sql`UPDATE tenant_users SET status='active' WHERE id=${actor}`)
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
    })
    await test('Revoked property binding blocks assigned approver despite stale context', async () => {
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(
        sql`UPDATE role_assignments SET scope=${JSON.stringify({ type: 'properties', propertyIds: [b] })}::jsonb WHERE tenant_user_id=${actor}`,
      )
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
      await assert.rejects(
        () =>
          decideApproval(actorCtx, {
            requestId: request.id,
            stage: 1,
            decision: 'approve',
            idempotencyKey: randomUUID(),
          }),
        /Property access denied|not assigned/,
      )
    })
    await test('Mixed-role read access cannot restore revoked decision authority', async () => {
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(
        sql`INSERT INTO role_assignments(tenant_id,tenant_user_id,role_id,scope) VALUES(${tenant},${actor},${unrelated},${JSON.stringify({ type: 'properties', propertyIds: [a] })}::jsonb)`,
      )
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
      await assert.rejects(
        () =>
          decideApproval(actorCtx, {
            requestId: request.id,
            stage: 1,
            decision: 'approve',
            idempotencyKey: randomUUID(),
          }),
        /not assigned for this property/,
      )
      await assert.rejects(
        () => createApprovalWorkflow(ctx, workflow(a)),
        /not assigned for this property/,
      )
    })
    await test('Explicit deny still overrides same-property wildcard role grant', async () => {
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(
        sql`UPDATE roles SET permissions='["approvals.*"]'::jsonb WHERE id=${privileged}`,
      )
      await tx.execute(
        sql`UPDATE user_permission_overrides SET effect='deny' WHERE tenant_user_id=${member} AND permission='approvals.configure'`,
      )
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
      await assert.rejects(() => createApprovalWorkflow(ctx, workflow(a)), /Missing permission/)
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(
        sql`UPDATE user_permission_overrides SET effect='grant' WHERE tenant_user_id=${member} AND permission='approvals.configure'`,
      )
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
    })
    await test('Revoked permission denied despite stale context and remaining read role', async () => {
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(
        sql`UPDATE roles SET permissions='["approvals.read"]'::jsonb WHERE id=${privileged}`,
      )
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
      await assert.rejects(
        () => createApprovalWorkflow(ctx, workflow(a)),
        /not assigned for this property/,
      )
    })
    await test('No denied operations produced approval decisions', async () => {
      const rows = await tx.execute(
        sql`SELECT count(*)::int AS n FROM approval_decisions WHERE tenant_id=${tenant}`,
      )
      assert.equal(rows[0]?.n, 0)
    })

    await tx.execute(sql`RESET ROLE`)
    await tx.execute(sql`UPDATE roles SET permissions=${JSON.stringify(permissions)}::jsonb WHERE id=${privileged}`)
    await tx.execute(sql`UPDATE role_assignments SET scope=${JSON.stringify({type:'properties',propertyIds:[a]})}::jsonb WHERE role_id=${reviewer}`)
    await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
    const lifecycleInput = () => ({ workflowId: w.id, source: {module:'tasks' as const,id:randomUUID(),version:'1'},idempotencyKey:randomUUID() })
    await test('Submission retries preserve the same immutable request', async () => {
      const input=lifecycleInput()
      const first=await submitApprovalRequest(ctx,input,adapters)
      const retry=await submitApprovalRequest(ctx,input,adapters)
      assert.equal(first.id,retry.id)
      await assert.rejects(()=>submitApprovalRequest(ctx,{...input,source:{...input.source,version:'2'}},adapters),/conflicts/)
    })
    await test('Approval persists a decision and immutable audit event; retries do not duplicate', async () => {
      const request=await submitApprovalRequest(ctx,lifecycleInput(),adapters)
      const decision={requestId:request.id,stage:1,decision:'approve',reason:'Reviewed',idempotencyKey:randomUUID()}
      const first=await decideApproval(actorCtx,decision)
      assert.equal((await decideApproval(actorCtx,decision)).id,first.id)
      const detail=await readApprovalRequest(ctx,request.id)
      assert.equal(detail.request.status,'approved')
      assert.equal(detail.events.length,2)
      assert.ok(detail.events.some(event=>event.kind==='approve'))
      const evidence=detail.events.find(event=>event.kind==='approve')?.evidence as {audit?:unknown}
      assert.ok(evidence.audit)
    })
    await test('Rejection requires a reason and persists rejected state and evidence', async () => {
      const request=await submitApprovalRequest(ctx,lifecycleInput(),adapters)
      const decision={requestId:request.id,stage:1,decision:'reject',reason:'',idempotencyKey:randomUUID()}
      await assert.rejects(()=>decideApproval(actorCtx,decision),/rejection reason/)
      await decideApproval(actorCtx,{...decision,reason:'Insufficient evidence'})
      const detail=await readApprovalRequest(ctx,request.id)
      assert.equal(detail.request.status,'rejected')
      assert.ok(detail.events.some(event=>event.kind==='reject'))
    })
    await test('Sequential stages cannot be skipped or decided by the requester', async () => {
      const workflow=await createApprovalWorkflow(ctx,{propertyId:a,name:'Two stage test',stages:[{name:'First',approverId:actor},{name:'Second',approverId:actor}]})
      const request=await submitApprovalRequest(ctx,{...lifecycleInput(),workflowId:workflow.id},adapters)
      const decision={requestId:request.id,stage:2,decision:'approve',reason:'',idempotencyKey:randomUUID()}
      await assert.rejects(()=>decideApproval(actorCtx,decision),/not current/)
      await assert.rejects(()=>decideApproval(ctx,{...decision,stage:1}),/Self-approval/)
      await decideApproval(actorCtx,{...decision,stage:1})
      assert.equal((await readApprovalRequest(ctx,request.id)).request.current_stage,2)
      await decideApproval(actorCtx,{...decision,idempotencyKey:randomUUID()})
      assert.equal((await readApprovalRequest(ctx,request.id)).request.status,'approved')
    })
    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await db.sql.end()
}
console.log(`${passed} checks passed; all synthetic records rolled back; no DDL or DEV access`)

// Existing isolated fixture only. All synthetic data is rolled back. No DDL.
import { ensureBucket } from '@beaconhs/storage'
import {
  attachApprovalDocument,
  approvalActivity,
  configureProductionWorkflow,
  createFinancialRequest,
  productionDecision,
  productionDetail,
  productionList,
  downloadApprovalDocument,
} from '../src/lib/approvals/production'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { deliverDomainNotification } from '@beaconhs/events'
import { getConnection, closeJobConnections } from '@beaconhs/jobs'
import { superDb, db as sharedDb } from '@beaconhs/db/client'
import { scanApprovalReminders } from '../../worker/src/lib/approval-reminders'
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
assert.equal(process.env.R2_ENDPOINT, 'http://localhost:9000')
await ensureBucket()
try {
  await db.db.transaction(async (tx) => {
    const check = await tx.execute(sql`SELECT current_database() AS db`)
    assert.equal(check[0]?.db, 'beaconhs_test')
    const ledger = await tx.execute(
      sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
    )
    assert.equal(ledger[0]?.n, 63)
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
    await tx.execute(
      sql`UPDATE roles SET permissions=${JSON.stringify(permissions)}::jsonb WHERE id=${privileged}`,
    )
    await tx.execute(
      sql`UPDATE role_assignments SET scope=${JSON.stringify({ type: 'properties', propertyIds: [a] })}::jsonb WHERE role_id=${reviewer}`,
    )
    await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
    const lifecycleInput = () => ({
      workflowId: w.id,
      source: { module: 'tasks' as const, id: randomUUID(), version: '1' },
      idempotencyKey: randomUUID(),
    })
    await test('Submission retries preserve the same immutable request', async () => {
      const input = lifecycleInput()
      const first = await submitApprovalRequest(ctx, input, adapters)
      const retry = await submitApprovalRequest(ctx, input, adapters)
      assert.equal(first.id, retry.id)
      await assert.rejects(
        () =>
          submitApprovalRequest(
            ctx,
            { ...input, source: { ...input.source, version: '2' } },
            adapters,
          ),
        /conflicts/,
      )
    })
    await test('Approval persists a decision and immutable audit event; retries do not duplicate', async () => {
      const request = await submitApprovalRequest(ctx, lifecycleInput(), adapters)
      const decision = {
        requestId: request.id,
        stage: 1,
        decision: 'approve',
        reason: 'Reviewed',
        idempotencyKey: randomUUID(),
      }
      const first = await decideApproval(actorCtx, decision)
      assert.equal((await decideApproval(actorCtx, decision)).id, first.id)
      const detail = await readApprovalRequest(ctx, request.id)
      assert.equal(detail.request.status, 'approved')
      assert.equal(detail.events.length, 2)
      assert.ok(detail.events.some((event) => event.kind === 'approve'))
      const evidence = detail.events.find((event) => event.kind === 'approve')?.evidence as {
        audit?: unknown
      }
      assert.ok(evidence.audit)
    })
    await test('Rejection requires a reason and persists rejected state and evidence', async () => {
      const request = await submitApprovalRequest(ctx, lifecycleInput(), adapters)
      const decision = {
        requestId: request.id,
        stage: 1,
        decision: 'reject',
        reason: '',
        idempotencyKey: randomUUID(),
      }
      await assert.rejects(() => decideApproval(actorCtx, decision), /rejection reason/)
      await decideApproval(actorCtx, { ...decision, reason: 'Insufficient evidence' })
      const detail = await readApprovalRequest(ctx, request.id)
      assert.equal(detail.request.status, 'rejected')
      assert.ok(detail.events.some((event) => event.kind === 'reject'))
    })
    await test('Sequential stages cannot be skipped or decided by the requester', async () => {
      const workflow = await createApprovalWorkflow(ctx, {
        propertyId: a,
        name: 'Two stage test',
        stages: [
          { name: 'First', approverId: actor },
          { name: 'Second', approverId: actor },
        ],
      })
      const request = await submitApprovalRequest(
        ctx,
        { ...lifecycleInput(), workflowId: workflow.id },
        adapters,
      )
      const decision = {
        requestId: request.id,
        stage: 2,
        decision: 'approve',
        reason: '',
        idempotencyKey: randomUUID(),
      }
      await assert.rejects(() => decideApproval(actorCtx, decision), /not current/)
      await assert.rejects(() => decideApproval(ctx, { ...decision, stage: 1 }), /Self-approval/)
      await decideApproval(actorCtx, { ...decision, stage: 1 })
      assert.equal((await readApprovalRequest(ctx, request.id)).request.current_stage, 2)
      await decideApproval(actorCtx, { ...decision, idempotencyKey: randomUUID() })
      assert.equal((await readApprovalRequest(ctx, request.id)).request.status, 'approved')
    })

    const delegate = randomUUID(),
      delegateUser = randomUUID()
    await tx.execute(sql`RESET ROLE`)
    await tx.execute(
      sql`INSERT INTO "user"(id,email,name) VALUES(${delegateUser},${delegateUser + '@example.invalid'},'Synthetic delegate')`,
    )
    await tx.execute(
      sql`INSERT INTO tenant_users(id,tenant_id,user_id,status) VALUES(${delegate},${tenant},${delegateUser},'active')`,
    )
    await tx.execute(
      sql`INSERT INTO role_assignments(tenant_id,tenant_user_id,role_id,scope) VALUES(${tenant},${delegate},${reviewer},${JSON.stringify({ type: 'properties', propertyIds: [a] })}::jsonb)`,
    )
    await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
    const delegateCtx = {
      ...ctx,
      userId: delegateUser,
      membership: { id: delegate, displayName: 'Delegate' },
    }
    const productionWorkflow = await configureProductionWorkflow(ctx, {
      propertyId: a,
      name: 'Financial production test',
      category: 'Maintenance',
      currency: 'GBP',
      maximumAmount: '5000',
      reminderHours: 24,
      stages: [{ name: 'Review', approverId: actor, roleId: reviewer, maximumAmount: '5000' }],
    })
    const file = {
      name: 'invoice.pdf',
      bytes: new TextEncoder().encode('%PDF-1.7\nSynthetic disposable evidence'),
    }
    const financialInput = () => ({
      workflowId: productionWorkflow.id,
      title: 'Synthetic invoice',
      category: 'Maintenance',
      amount: '125.01',
      currency: 'GBP',
      supplier: 'Synthetic supplier',
      description: 'Disposable test only',
      idempotencyKey: randomUUID(),
    })
    const input = financialInput()
    const financial = await createFinancialRequest(ctx, input, file)
    const activity = (kind: string) => ({
      requestId: financial.id,
      kind,
      body: 'Synthetic test evidence',
      stage: 1,
      assignmentVersion: 0,
      idempotencyKey: randomUUID(),
    })
    await test('Production financial request persists exact amount and secure document; idempotent retry', async () => {
      const repeat = await createFinancialRequest(ctx, input, file)
      assert.equal(repeat.id, financial.id)
      const detail = await productionDetail(ctx, financial.id, 'documents', '', 1)
      assert.equal(detail.financial.amount, '125.01')
      assert.equal(detail.rows.length, 1)
      const document = await downloadApprovalDocument(ctx, financial.id, String(detail.rows[0]!.id))
      assert.equal(document.bytes.toString(), Buffer.from(file.bytes).toString())
      await assert.rejects(
        () => createFinancialRequest(ctx, { ...input, amount: '125.02' }, file),
        /conflicts/,
      )
      await assert.rejects(
        () => createFinancialRequest(ctx, { ...financialInput(), amount: '5000.01' }, file),
        /exceeds/,
      )
      await assert.rejects(
        () => createFinancialRequest(ctx, { ...financialInput(), currency: 'EUR' }, file),
        /exceeds/,
      )
    })
    await test('Production lists and document access preserve property and tenant isolation', async () => {
      const list = await productionList(ctx, {
        view: 'my',
        q: 'Synthetic invoice',
        status: 'pending',
        propertyId: a,
        page: 1,
        perPage: 25,
      })
      assert.ok(list.rows.some((r) => r.id === financial.id))
      assert.ok(!list.rows.some((r) => r.id === requestB.id))
      await assert.rejects(
        () => productionDetail({ ...ctx, tenantId: foreign }, financial.id, 'documents', '', 1),
        /disabled/,
      )
      await assert.rejects(
        () =>
          productionDetail(
            { ...ctx, scopes: [{ type: 'properties', propertyIds: [b] }] },
            financial.id,
            'documents',
            '',
            1,
          ),
        /unavailable/,
      )
      const rows = await tx.execute(
        sql`SELECT * FROM approval_documents WHERE tenant_id=${foreign}`,
      )
      assert.equal(rows.length, 0)
    })
    await test('Additional documents require current requester access and persist once on retry', async () => {
      const attachment = { requestId: financial.id, idempotencyKey: randomUUID() }
      const first = await attachApprovalDocument(ctx, attachment, { ...file, name: 'support.pdf' })
      assert.equal(
        (await attachApprovalDocument(ctx, attachment, { ...file, name: 'support.pdf' })).id,
        first.id,
      )
      await assert.rejects(
        () =>
          attachApprovalDocument(actorCtx, { ...attachment, idempotencyKey: randomUUID() }, file),
        /Only the financial requester|Missing permission/,
      )
      assert.equal((await productionDetail(ctx, financial.id, 'documents', '', 1)).rows.length, 2)
      assert.equal((await createFinancialRequest(ctx, input, file)).id, financial.id)
    })
    await test('Comments, more-information and resubmission preserve financial evidence and audit', async () => {
      const comment = activity('comment')
      const first = await approvalActivity(ctx, comment)
      assert.equal((await approvalActivity(ctx, comment)).id, first.id)
      await approvalActivity(actorCtx, activity('more_info'))
      assert.equal(
        (await productionDetail(ctx, financial.id, 'timeline', '', 1)).request.status,
        'more_info',
      )
      await assert.rejects(
        () =>
          productionDecision(actorCtx, {
            requestId: financial.id,
            stage: 1,
            decision: 'approve',
            idempotencyKey: randomUUID(),
          }),
        /already resolved|not current/,
      )
      await approvalActivity(ctx, activity('resubmit'))
      assert.equal(
        (await productionDetail(ctx, financial.id, 'timeline', '', 1)).request.status,
        'pending',
      )
      const evidence = await tx.execute(
        sql`SELECT audit_snapshot FROM approval_activity WHERE request_id=${financial.id} AND tenant_id=${tenant}`,
      )
      assert.ok(evidence.every((e) => Object.keys(e.audit_snapshot as object).length > 0))
    })
    await test('Delegation preserves original stages, rejects self/requester and stale assignment, and authorises delegate decision', async () => {
      await assert.rejects(
        () => approvalActivity(actorCtx, { ...activity('delegate'), targetId: actor }),
        /yourself/,
      )
      await assert.rejects(
        () => approvalActivity(actorCtx, { ...activity('delegate'), targetId: member }),
        /requester/,
      )
      await approvalActivity(actorCtx, { ...activity('delegate'), targetId: delegate })
      const original = (
        await tx.execute(
          sql`SELECT approver_id FROM approval_stages WHERE tenant_id=${tenant} AND request_id=${financial.id} AND position=1`,
        )
      )[0]
      assert.equal(original?.approver_id, actor)
      await assert.rejects(
        () =>
          productionDecision(actorCtx, {
            requestId: financial.id,
            stage: 1,
            decision: 'approve',
            idempotencyKey: randomUUID(),
          }),
        /assigned approver/,
      )
      await assert.rejects(
        () => approvalActivity(delegateCtx, { ...activity('more_info'), assignmentVersion: 0 }),
        /changed/,
      )
      await productionDecision(delegateCtx, {
        requestId: financial.id,
        stage: 1,
        assignmentVersion: 1,
        decision: 'approve',
        reason: 'Reviewed by delegate',
        idempotencyKey: randomUUID(),
      })
      assert.equal(
        (await productionDetail(ctx, financial.id, 'timeline', '', 1)).request.status,
        'approved',
      )
    })
    await test('Cancellation is requester-only and terminal; notification effects are durable', async () => {
      const second = await createFinancialRequest(ctx, financialInput(), file)
      const cancel = { ...activity('cancel'), requestId: second.id }
      await assert.rejects(() => approvalActivity(actorCtx, cancel), /requester/)
      await approvalActivity(ctx, cancel)
      assert.equal(
        (await productionDetail(ctx, second.id, 'timeline', '', 1)).request.status,
        'cancelled',
      )
      await assert.rejects(
        () =>
          productionDecision(actorCtx, {
            requestId: second.id,
            stage: 1,
            decision: 'approve',
            idempotencyKey: randomUUID(),
          }),
        /already resolved|not current/,
      )
      const events = await tx.execute(
        sql`SELECT id FROM domain_event_outbox WHERE tenant_id=${tenant} AND subject_id=${second.id}`,
      )
      assert.equal(events.length, 2)
    })
    await test('Financial role limits reject revoked configured roles before a decision', async () => {
      const third = await createFinancialRequest(ctx, financialInput(), file)
      await tx.execute(sql`RESET ROLE`)
      await tx.execute(
        sql`DELETE FROM role_assignments WHERE tenant_id=${tenant} AND tenant_user_id=${actor} AND role_id=${reviewer}`,
      )
      await tx.execute(
        sql`INSERT INTO role_assignments(tenant_id,tenant_user_id,role_id,scope) VALUES(${tenant},${actor},${privileged},${JSON.stringify({ type: 'properties', propertyIds: [a] })}::jsonb)`,
      )
      await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
      await assert.rejects(
        () =>
          productionDecision(actorCtx, {
            requestId: third.id,
            stage: 1,
            decision: 'approve',
            idempotencyKey: randomUUID(),
          }),
        /configured financial role/,
      )
    })
    await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`)

    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await db.sql.end()
}
console.log(`${passed} checks passed; lifecycle fixture rolled back; no DDL or DEV access`)
await verifyConcurrentDecisions()
async function verifyConcurrentDecisions() {
  assert.equal(
    process.env.DATABASE_URL,
    'postgresql://beaconhs_app:beaconhs_app@localhost:5432/beaconhs_test',
  )
  const fixture = createClient({ url, max: 1 }),
    runtime = createClient({ url: process.env.DATABASE_URL, max: 4 })
  const tenant = randomUUID(),
    propertyId = randomUUID(),
    roleId = randomUUID()
  const members = Array.from({ length: 3 }, () => ({ id: randomUUID(), userId: randomUUID() }))
  const permissions = [
    'approvals.read',
    'approvals.submit',
    'approvals.configure',
    'approvals.decide',
  ]
  try {
    await fixture.db.transaction(async (tx) => {
      await tx.execute(
        sql`INSERT INTO tenants(id,slug,name) VALUES(${tenant},${tenant},'Disposable concurrent approval fixture')`,
      )
      await tx.execute(
        sql`INSERT INTO tenant_module_entitlements(tenant_id,module_key,state) VALUES(${tenant},'approvals','enabled')`,
      )
      await tx.execute(
        sql`INSERT INTO hospitality_properties(id,tenant_id,name,code,timezone) VALUES(${propertyId},${tenant},'Disposable concurrency property',${propertyId},'UTC')`,
      )
      await tx.execute(
        sql`INSERT INTO roles(id,tenant_id,key,name,permissions) VALUES(${roleId},${tenant},${roleId},'Disposable approval authority',${JSON.stringify(permissions)}::jsonb)`,
      )
      for (const member of members) {
        await tx.execute(
          sql`INSERT INTO "user"(id,email,name) VALUES(${member.userId},${member.userId + '@example.invalid'},'Disposable concurrency member')`,
        )
        await tx.execute(
          sql`INSERT INTO tenant_users(id,tenant_id,user_id,status) VALUES(${member.id},${tenant},${member.userId},'active')`,
        )
        await tx.execute(
          sql`INSERT INTO role_assignments(tenant_id,tenant_user_id,role_id,scope) VALUES(${tenant},${member.id},${roleId},${JSON.stringify({ type: 'properties', propertyIds: [propertyId] })}::jsonb)`,
        )
      }
    })
    const context = (index: number): RequestContext => ({
      tenantId: tenant,
      userId: members[index]!.userId,
      isSuperAdmin: false,
      membership: { id: members[index]!.id, displayName: 'Disposable member' },
      personId: null,
      permissions: new Set(permissions),
      scopes: [{ type: 'properties', propertyIds: [propertyId] }],
      timezone: 'UTC',
      locale: 'en',
      defaultLocale: 'en',
      enabledLocales: ['en'],
      localeOverride: null,
      db: (fn) =>
        runtime.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('app.tenant_id',${tenant},true),set_config('app.action_scope_mode','property',true),set_config('app.action_property_ids',${JSON.stringify([propertyId])},true)`,
          )
          return fn(tx as unknown as Database)
        }),
    })
    const owner = context(0),
      reviewer = context(1)
    const workflow = await configureProductionWorkflow(owner, {
      propertyId,
      name: 'Concurrent financial review',
      category: 'Test',
      currency: 'GBP',
      maximumAmount: '1000.01',
      reminderHours: 1,
      emailEnabled: true,
      inAppEnabled: true,
      stages: [{ name: 'Review', approverId: members[1]!.id, roleId, maximumAmount: '1000.01' }],
    })
    const create = () =>
      createFinancialRequest(
        owner,
        {
          workflowId: workflow.id,
          title: 'Disposable concurrency request',
          category: 'Test',
          amount: '100.01',
          currency: 'GBP',
          supplier: 'Synthetic test',
          description: 'Disposable only',
          idempotencyKey: randomUUID(),
        },
        { name: 'test.pdf', bytes: new TextEncoder().encode('%PDF-1.7\\nDisposable race test') },
      )
    const first = await create()
    const decisions = ['approve', 'reject'].map((decision) => ({
      requestId: first.id,
      stage: 1,
      assignmentVersion: 0,
      decision,
      reason: 'Concurrent test',
      idempotencyKey: randomUUID(),
    }))
    const results = await Promise.allSettled(
      decisions.map((input) => productionDecision(reviewer, input)),
    )
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1)
    const row = await owner.db((tx) =>
      tx.execute(
        sql`SELECT count(*)::int AS n FROM approval_decisions WHERE tenant_id=${tenant} AND request_id=${first.id}`,
      ),
    )
    assert.equal(row[0]?.n, 1)
    const winningIndex = results.findIndex((r) => r.status === 'fulfilled')
    await productionDecision(reviewer, decisions[winningIndex]!)
    console.log('PASS concurrent approve/reject: exactly one decision and idempotent winner retry')
    const second = await create()
    const race = await Promise.allSettled([
      productionDecision(reviewer, {
        requestId: second.id,
        stage: 1,
        assignmentVersion: 0,
        decision: 'approve',
        idempotencyKey: randomUUID(),
      }),
      approvalActivity(reviewer, {
        requestId: second.id,
        stage: 1,
        assignmentVersion: 0,
        kind: 'delegate',
        targetId: members[2]!.id,
        body: 'Concurrent handover',
        idempotencyKey: randomUUID(),
      }),
    ])
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1)
    const detail = await productionDetail(owner, second.id, 'timeline', '', 1)
    if (detail.request.status === 'pending') {
      assert.equal(detail.request.assignee_id, members[2]!.id)
      assert.equal(Number(detail.request.assignment_version), 1)
      await productionDecision(context(2), {
        requestId: second.id,
        stage: 1,
        assignmentVersion: 1,
        decision: 'approve',
        idempotencyKey: randomUUID(),
      })
    } else assert.equal(detail.request.status, 'approved')
    console.log('PASS concurrent delegation/decision serialization; stale authority cannot decide')

    const third = await create()
    const eventId = randomUUID()
    await deliverDomainNotification(tenant, eventId, {
      kind: 'approval_updated',
      requestId: third.id,
    })
    await deliverDomainNotification(tenant, eventId, {
      kind: 'approval_updated',
      requestId: third.id,
    })
    const redis = getConnection() as unknown as {
      hgetall(key: string): Promise<Record<string, string>>
    }
    const jobId = (event: string, userId: string) =>
      'approval|' +
      createHash('sha256')
        .update(event + '|' + userId)
        .digest('hex')
    for (const member of members.slice(0, 2)) {
      const id = jobId(eventId, member.userId)
      const notification = await redis.hgetall('bull:notifications:' + id)
      assert.ok(notification.data)
      const payload = JSON.parse(notification.data!)
      assert.deepEqual(payload.userIds, [member.userId])
      assert.equal(payload.tenantId, tenant)
      assert.equal(payload.linkPath, '/approvals/requests/' + third.id)
      assert.ok(!notification.data!.includes('Synthetic test'))
      const email = await redis.hgetall('bull:emails:' + id + '|email')
      assert.ok(email.data)
      assert.equal(JSON.parse(email.data!).to, member.userId + '@example.invalid')
    }
    console.log(
      'PASS real notification/email queue fanout with stable retry IDs and no financial content',
    )
    await fixture.db.execute(
      sql`INSERT INTO user_permission_overrides(tenant_id,tenant_user_id,permission,effect) VALUES(${tenant},${members[1]!.id},'approvals.read','deny')`,
    )
    const deniedEvent = randomUUID()
    await deliverDomainNotification(tenant, deniedEvent, {
      kind: 'approval_updated',
      requestId: third.id,
    })
    assert.deepEqual(
      await redis.hgetall('bull:notifications:' + jobId(deniedEvent, members[1]!.userId)),
      {},
    )
    console.log('PASS notification dispatch rechecks revoked recipient authority')
    const slot = new Date(Date.now() + 2 * 3600000)
    await scanApprovalReminders(slot)
    await scanApprovalReminders(slot)
    const reminders = await owner.db((tx) =>
      tx.execute(
        sql`SELECT id FROM domain_event_outbox WHERE tenant_id=${tenant} AND subject_id=${third.id} AND event_type='approval.reminder'`,
      ),
    )
    assert.equal(reminders.length, 1)
    console.log('PASS automatic reminder scheduling and same-slot idempotence')
    console.log(
      'Concurrency and notification fixtures committed only to disposable CI services; runner disposal removes all data',
    )
  } finally {
    await closeJobConnections()
    await Promise.all([
      fixture.sql.end(),
      runtime.sql.end(),
      superDb.$client.end(),
      sharedDb.$client.end(),
    ])
  }
}

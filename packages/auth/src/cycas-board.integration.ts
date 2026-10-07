import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { hashPassword } from 'better-auth/crypto'
import { getTableName, sql } from 'drizzle-orm'
import { createClient, executeParameterizedRows, type Database } from '@beaconhs/db/client'
import * as schema from '@beaconhs/db/schema'
import {
  buildCycasDemoSeedPlan,
  CYCAS_DEMO_TENANT_SLUG,
  cycasId,
} from '@beaconhs/db/cycas-demo-seed-plan'
import { buildCycasSeedBatches } from '@beaconhs/db/cycas-demo-seed-rows'
import { seedCycasDemo } from '@beaconhs/db/cycas-demo-seed-runner'

const raw = process.env.CYCAS_TEST_DATABASE_URL
if (!raw) throw new Error('CYCAS_TEST_DATABASE_URL must explicitly target a disposable database')
const url = new URL(raw)
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  !/test/.test(url.pathname) ||
  ['production', 'staging'].includes(process.env.NODE_ENV ?? '')
)
  throw new Error('Cycas integration tests require a local disposable test database')

const client = createClient({ url: raw, max: 1 })
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
const plan = buildCycasDemoSeedPlan()
const manualTenant = 'f6d43808-18d4-4526-81b9-651e30aef383'
const manualProperty = '089ff362-aa28-488f-bbf3-b829db65520a'
const originalProperty = '94f6031e-3d3d-4b5a-9584-b13c3aeb8381'
const fixtureUser = 'cycas-preservation-fixture'
const tables = [
  ...new Set(buildCycasSeedBatches(plan).map((b) => getTableName(b.table))),
  'platform_audit_log',
]
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"'
let checks = 0
async function snapshot(tx: Tx) {
  const data: Record<string, unknown> = {}
  for (const name of tables) {
    // All pre-existing rows, including accounts/settings/entitlements, are compared.
    data[name] = await executeParameterizedRows(
      tx,
      `SELECT to_jsonb(t) AS row FROM ${quote(name)} t ORDER BY id::text`,
    )
  }
  return data
}
async function fixture(tx: Tx) {
  await tx.insert(schema.users).values({
    id: fixtureUser,
    name: 'Manual DEV fixture',
    email: 'manual-fixture@uvanoo.invalid',
  })
  await tx.insert(schema.account).values({
    id: fixtureUser,
    userId: fixtureUser,
    accountId: fixtureUser,
    providerId: 'credential',
    password: await hashPassword(randomBytes(24).toString('hex')),
  })
  await tx.insert(schema.tenants).values({
    id: manualTenant,
    slug: 'Vertiq',
    name: 'Vertiq Hospitality',
    settings: { devBootstrap: 'uvanoo-minimal-development-v1', manualAcceptance: true },
  })
  await tx.insert(schema.hospitalityProperties).values([
    {
      id: originalProperty,
      tenantId: manualTenant,
      name: 'Uvanoo Development Hotel',
      code: 'UVANOO-DEV',
      timezone: 'Europe/London',
    },
    {
      id: manualProperty,
      tenantId: manualTenant,
      name: 'Lincoln Suites',
      code: 'TLS',
      timezone: 'Europe/London',
      metadata: { manualAcceptance: true },
    },
  ])
  await tx.insert(schema.hospitalityBuildings).values({
    id: '0820ce44-4e4f-4acb-aac8-f75fb1335d88',
    tenantId: manualTenant,
    propertyId: originalProperty,
    name: 'Test Building',
    code: 'TLS',
  })
  await tx.insert(schema.hospitalityFloors).values({
    id: '07b6b341-42d0-41d1-8e7c-4ad1bcf4ef1b',
    tenantId: manualTenant,
    buildingId: '0820ce44-4e4f-4acb-aac8-f75fb1335d88',
    name: '1',
    code: '1',
  })
  await tx.insert(schema.hospitalityRooms).values({
    id: '7a39e3cc-425e-47ec-8fbb-4813f0dde352',
    tenantId: manualTenant,
    floorId: '07b6b341-42d0-41d1-8e7c-4ad1bcf4ef1b',
    code: '101',
    name: 'room 101',
    roomType: 'Studio',
  })
  await tx.insert(schema.tenantModuleEntitlements).values({
    id: cycasId('test:existing-entitlement'),
    tenantId: manualTenant,
    moduleKey: 'hospitality.compliance',
    state: 'disabled',
  })
}
function adapter(tx: Tx, onInsert?: () => void): Pick<Database, 'transaction'> {
  const counted = new Proxy(tx, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown
      if (prop === 'insert')
        return (...args: Parameters<Tx['insert']>) => {
          onInsert?.()
          return target.insert(...args)
        }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return { transaction: async (callback) => callback(counted) }
}
async function rollbackTest(name: string, test: (tx: Tx) => Promise<void>) {
  const rollback = new Error('intentional test rollback')
  try {
    await client.db.transaction(async (tx) => {
      await fixture(tx)
      await test(tx)
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  }
  checks++
  console.log(`PASS: ${name}`)
}
const secret = randomBytes(24).toString('base64url')
const hashes = Object.fromEntries(
  await Promise.all(
    plan.staff.map(async (member) => [member.email, await hashPassword(secret)] as const),
  ),
)

try {
  await rollbackTest(
    'full dataset, preservation, exact replay, credentials and property RLS',
    async (tx) => {
      const before = await snapshot(tx)
      const inserted = await seedCycasDemo(adapter(tx), plan, async () => hashes)
      assert.equal(inserted.state, 'inserted')
      const seeded = await snapshot(tx)
      for (const name of tables) {
        const oldRows = before[name] as { row: { id: string } }[]
        const newRows = seeded[name] as { row: { id: string } }[]
        for (const old of oldRows)
          assert.deepEqual(
            newRows.find((r) => r.row.id === old.row.id),
            old,
          )
      }
      assert.equal(plan.tenantId === manualTenant, false)
      const count = async (table: string, where = 'true', params: unknown[] = []) => {
        const [row] = await executeParameterizedRows(
          tx,
          `SELECT count(*)::int AS n FROM ${quote(table)} WHERE ${where}`,
          params,
        )
        return Number(row!.n)
      }
      const counts = inserted.counts as Record<string, number>
      for (const [table, n] of Object.entries(counts)) {
        const expectedIds = buildCycasSeedBatches(plan)
          .filter((b) => getTableName(b.table) === table)
          .flatMap((b) => b.rows.map((r) => String(r.id)))
        assert.equal(
          await count(table, 'id::text IN (SELECT jsonb_array_elements_text($1::jsonb))', [
            JSON.stringify(expectedIds),
          ]),
          n,
        )
      }
      assert.equal(
        await count('people', "tenant_id=$1::uuid AND metadata->>'employmentType'='contractor'", [
          plan.tenantId,
        ]),
        6,
      )
      assert.equal(
        await count('tenant_module_entitlements', "tenant_id=$1::uuid AND state='enabled'", [
          plan.tenantId,
        ]),
        5,
      )
      const propertyCounts = await executeParameterizedRows(
        tx,
        `
      SELECT p.name, count(DISTINCT f.id)::int floors, count(r.id)::int rooms
      FROM hospitality_properties p JOIN hospitality_buildings b ON b.property_id=p.id
      JOIN hospitality_floors f ON f.building_id=b.id
      JOIN hospitality_rooms r ON r.floor_id=f.id WHERE p.tenant_id=$1::uuid
      GROUP BY p.name ORDER BY p.name`,
        [plan.tenantId],
      )
      assert.deepEqual(Array.from(propertyCounts), [
        { name: 'One Fifty Fenchurch', floors: 5, rooms: 33 },
        { name: 'The Lincoln Suites', floors: 5, rooms: 54 },
      ])
      assert.equal(await count('hospitality_rooms', 'tenant_id=$1::uuid', [plan.tenantId]), 87)
      const duplicateRooms = await executeParameterizedRows(
        tx,
        'SELECT code FROM hospitality_rooms WHERE tenant_id=$1::uuid GROUP BY code HAVING count(*)>1',
        [plan.tenantId],
      )
      assert.equal(duplicateRooms.length, 0)
      let writes = 0
      const repeated = await seedCycasDemo(
        adapter(tx, () => writes++),
        plan,
        async () => {
          throw new Error('Replay must not provision or read credentials')
        },
      )
      assert.equal(repeated.state, 'unchanged')
      assert.equal(writes, 0)
      assert.deepEqual(await snapshot(tx), seeded)

      const auth = betterAuth({
        database: drizzleAdapter(tx, {
          provider: 'pg',
          schema: {
            user: schema.users,
            session: schema.sessions,
            account: schema.account,
            verification: schema.verification,
          },
        }),
        secret: randomBytes(32).toString('hex'),
        baseURL: 'http://localhost:3000',
        logger: { disabled: true },
        rateLimit: { enabled: false },
        emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 24 },
      })
      for (const member of plan.staff) {
        const signedIn = await auth.api.signInEmail({
          body: { email: member.email, password: secret },
        })
        assert.equal(signedIn.user.id, member.userId)
        const assignments = await executeParameterizedRows(
          tx,
          'SELECT scope FROM role_assignments WHERE tenant_user_id=$1::uuid',
          [member.tenantUserId],
        )
        assert.deepEqual(
          Array.from(assignments, (r) => r.scope),
          [{ type: 'properties', propertyIds: member.propertyIds }],
        )
      }
      // Run the real installed RLS policies as the application role. The disposable
      // test connection is an administrator solely to SET ROLE, never live DEV.
      for (const member of plan.staff) {
        await tx.execute(sql`SET LOCAL ROLE beaconhs_app`)
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${plan.tenantId}, true),
        set_config('app.action_scope_mode', 'property', true),
        set_config('app.action_property_ids', ${JSON.stringify(member.propertyIds)}, true)`)
        const expectedProperties = member.propertyIds.length
        assert.equal(await count('hospitality_properties'), expectedProperties)
        assert.equal(
          await count('hospitality_rooms'),
          member.propertyIds.reduce(
            (sum, id) => sum + (id === plan.properties[0]!.id ? 33 : 54),
            0,
          ),
        )
        assert.equal(await count('inspection_records'), expectedProperties * 6)
        assert.equal(await count('compliance_obligations'), expectedProperties * 28)
        assert.equal(await count('maintenance_issues'), expectedProperties * 12)
        assert.equal(await count('incidents'), expectedProperties * 3)
        await tx.execute(sql`RESET ROLE`)
      }
      console.log(
        JSON.stringify({
          plannedCounts: counts,
          successfulLogins: plan.staff.length,
          scopedUsers: plan.staff.length,
        }),
      )
    },
  )

  const collisionCases: [
    string,
    (p: ReturnType<typeof buildCycasDemoSeedPlan>, tx: Tx) => Promise<void>,
  ][] = [
    [
      'tenant ID',
      async (p) => {
        p.tenantId = manualTenant
      },
    ],
    [
      'tenant slug',
      async (_p, tx) => {
        await tx.insert(schema.tenants).values({
          id: cycasId('test:slug'),
          slug: CYCAS_DEMO_TENANT_SLUG,
          name: 'Unowned tenant',
        })
      },
    ],
    [
      'global user ID',
      async (p) => {
        p.staff[0]!.userId = fixtureUser
      },
    ],
    [
      'email case alias',
      async (p) => {
        p.staff[0]!.email = 'MANUAL-FIXTURE@uvanoo.invalid'
      },
    ],
    [
      'property ID',
      async (p) => {
        const previous = p.properties[0]!.id
        p.properties[0]!.id = manualProperty
        p.hotels.fenchurch.propertyId = manualProperty
        for (const member of p.staff)
          member.propertyIds = member.propertyIds.map((id) =>
            id === previous ? manualProperty : id,
          )
      },
    ],
    [
      'property code',
      async (p) => {
        p.properties[1]!.code = p.properties[0]!.code
      },
    ],
    [
      'room ID',
      async (p) => {
        p.hotels.fenchurch.rooms[0]!.id = '7a39e3cc-425e-47ec-8fbb-4813f0dde352'
      },
    ],
    [
      'room code',
      async (p) => {
        p.hotels.lincoln.rooms[0]!.code = p.hotels.fenchurch.rooms[0]!.code
      },
    ],
    [
      'document case-insensitive key',
      async (p) => {
        p.hotels.lincoln.documents[0]!.key = p.hotels.fenchurch.documents[0]!.key.toLowerCase()
      },
    ],
    [
      'partial unmanifested seed',
      async (_p, tx) => {
        await tx.insert(schema.tenants).values({
          id: plan.tenantId,
          slug: CYCAS_DEMO_TENANT_SLUG,
          name: 'Cycas Hospitality',
          settings: { demoSeedKey: 'cycas-hospitality-portfolio-v1' },
        })
      },
    ],
    [
      'audit marker ID',
      async (_p, tx) => {
        await tx.insert(schema.platformAuditLog).values({
          id: cycasId('board-manifest:2026-10-15'),
          entityType: 'unrelated',
          action: 'create',
        })
      },
    ],
  ]
  for (const [label, setup] of collisionCases) {
    await rollbackTest(`collision before writes: ${label}`, async (tx) => {
      const candidate = buildCycasDemoSeedPlan()
      await setup(candidate, tx)
      const before = await snapshot(tx)
      let writes = 0
      await assert.rejects(
        seedCycasDemo(
          adapter(tx, () => writes++),
          candidate,
          async () => hashes,
        ),
        /collision/i,
      )
      assert.equal(writes, 0)
      assert.deepEqual(await snapshot(tx), before)
    })
  }
  await rollbackTest(
    'seed-owned records edited manually fail closed without mutation',
    async (tx) => {
      await seedCycasDemo(adapter(tx), plan, async () => hashes)
      await tx.execute(sql`UPDATE hospitality_properties SET name='Manual edit after demo'
      WHERE id=${plan.properties[0]!.id}::uuid`)
      const before = await snapshot(tx)
      let writes = 0
      await assert.rejects(
        seedCycasDemo(
          adapter(tx, () => writes++),
          plan,
          async () => hashes,
        ),
        /changed after seeding/,
      )
      assert.equal(writes, 0)
      assert.deepEqual(await snapshot(tx), before)
    },
  )
  await rollbackTest('late insert failure rolls back the whole seed transaction', async (tx) => {
    const before = await snapshot(tx)
    let writes = 0
    const transactional: Pick<Database, 'transaction'> = {
      transaction: (callback) =>
        tx.transaction(async (inner) =>
          callback(
            new Proxy(inner, {
              get(target, prop) {
                const value = Reflect.get(target, prop, target) as unknown
                if (prop === 'insert')
                  return (...args: Parameters<Tx['insert']>) => {
                    if (++writes === 10) throw new Error('Injected late write failure')
                    return target.insert(...args)
                  }
                return typeof value === 'function' ? value.bind(target) : value
              },
            }),
          ),
        ),
    }
    await assert.rejects(
      seedCycasDemo(transactional, plan, async () => hashes),
      /transaction rolled back/,
    )
    assert.equal(writes, 10)
    assert.deepEqual(await snapshot(tx), before)
  })
  // Postflight verifies that rollback-only tests leave the disposable database
  // just as they found it, rather than relying on cleanup DELETE statements.
  const leftovers = await executeParameterizedRows(
    client.db,
    'SELECT id FROM tenants WHERE id IN ($1::uuid,$2::uuid)',
    [manualTenant, plan.tenantId],
  )
  assert.equal(leftovers.length, 0)
  console.log(`Cycas Board integration: ${checks} scenarios PASS; all fixtures rolled back.`)
} catch (error) {
  // Never serialize auth/driver failures or assertion values (which may contain hashes).
  console.error('Cycas integration failed:', error instanceof Error ? error.name : 'unknown')
  if (
    error instanceof Error &&
    !error.message.includes('Failed query:') &&
    error.name !== 'AssertionError'
  )
    console.error(error.message)
  if (error instanceof Error)
    console.error(
      error.stack
        ?.split('\n')
        .filter((line) => line.trim().startsWith('at '))
        .join('\n'),
    )
  process.exitCode = 1
} finally {
  await client.sql.end()
}

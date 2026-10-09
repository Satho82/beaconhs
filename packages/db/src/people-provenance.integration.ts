import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import postgres, { type TransactionSql } from 'postgres'

// Explicit opt-in and fixture-only boundary: never fall back to application URLs.
const url = new URL(process.env.PEOPLE_PROVENANCE_TEST_DATABASE_URL ?? 'http://invalid')
assert.equal(process.env.UVANOO_PEOPLE_PROVENANCE_INTEGRATION, '1')
assert.equal(url.protocol, 'postgresql:')
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname))
assert.ok(['5432', '55449'].includes(url.port))
assert.equal(url.pathname, '/beaconhs_test')
assert.equal(url.username, 'postgres')
assert.ok(['postgres', 'batch01_disposable'].includes(url.password))
assert.equal(url.search + url.hash, '')

const options = { max: 1, prepare: false, onnotice: () => undefined, connect_timeout: 5 }
const admin = postgres(url.toString(), options)
url.username = url.password = 'beaconhs_app'
const reader = postgres(url.toString(), options)
const writer = postgres(url.toString(), options)
const other = postgres(url.toString(), options)
const tenant = '1b000000-0000-4000-8000-000000000001'
const foreignTenant = '1b000000-0000-4000-8000-000000000002'
const id = (kind: number, n: number) =>
  `${kind}b000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const hotel = id(2, 1)
const secondHotel = id(2, 2)
const foreignHotel = id(2, 3)
const site = id(3, 1)
const legacySite = id(3, 2)
const secondSite = id(3, 3)
const person = id(4, 1)
let passed = 0
function pass(name: string) {
  console.log(`PASS: ${name}`)
  passed++
}
async function context(tx: TransactionSql, mode = 'legacy', selected = [hotel], target = tenant) {
  await tx`SELECT set_config('app.tenant_id', ${target}, true),
    set_config('app.action_scope_mode', ${mode}, true),
    set_config('app.action_property_ids', ${JSON.stringify(selected)}, true),
    set_config('statement_timeout', '8000', true), set_config('lock_timeout', '6000', true)`
}
async function visible(tx: TransactionSql, target = person) {
  const rows = await tx`SELECT id FROM public.people WHERE id = ${target}`
  return rows.length
}
async function rejected(work: () => Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => (error as { code?: string }).code === code)
}
async function waitForLock(pid: number) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const rows =
      await admin`SELECT 1 FROM pg_stat_activity WHERE pid=${pid} AND wait_event='advisory'`
    if (rows.length) return
    await delay(20)
  }
  throw new Error(`Backend ${pid} did not wait on the provenance advisory lock`)
}
function latch() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}
async function resetAssignment(org: string | null = null) {
  await writer.begin(async (tx) => {
    await context(tx, 'tenant')
    await tx`DELETE FROM public.people_assignments WHERE tenant_id=${tenant} AND person_id=${person}`
    if (org)
      await tx`INSERT INTO public.people_assignments (tenant_id, person_id, org_unit_id, valid_from)
      VALUES (${tenant},${person},${org},current_date)`
  })
}

try {
  await admin.unsafe(
    readFileSync(new URL('./people-property-provenance.integration.sql', import.meta.url), 'utf8'),
  )
  pass('original hidden-assignment and unassigned-person regression, rolled back')
  assert.equal((await admin`SELECT 1 FROM tenants WHERE slug='provenance-diagnostic'`).length, 0)
  await admin.begin(async (tx) => {
    await tx`INSERT INTO tenants (id,slug,name) VALUES (${tenant},'b01-provenance-test-a','Synthetic A'), (${foreignTenant},'b01-provenance-test-b','Synthetic B')`
    await tx`INSERT INTO hospitality_properties (id,tenant_id,name,code,timezone) VALUES
      (${hotel},${tenant},'A','A','UTC'),(${secondHotel},${tenant},'B','B','UTC'),(${foreignHotel},${foreignTenant},'Foreign','F','UTC')`
    await tx`INSERT INTO org_units (id,tenant_id,level,name,metadata) VALUES
      (${site},${tenant},'site','A',${tx.json({ hospitalityPropertyId: hotel })}),
      (${legacySite},${tenant},'site','Legacy','{}'),
      (${secondSite},${tenant},'site','B',${tx.json({ hospitalityPropertyId: secondHotel })}),
      (${id(3, 4)},${foreignTenant},'site','Foreign',${tx.json({ hospitalityPropertyId: foreignHotel })})`
    await tx`INSERT INTO people (id,tenant_id,first_name,last_name) VALUES
      (${person},${tenant},'Concurrent','Fixture'),(${id(4, 2)},${foreignTenant},'Foreign','Fixture')`
    await tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from)
      VALUES (${foreignTenant},${id(4, 2)},${id(3, 4)},current_date)`
    await tx`INSERT INTO training_records (tenant_id,person_id,source,completed_on) VALUES (${tenant},${person},'migrated',current_date)`
    await tx`INSERT INTO ppe_types (id,tenant_id,name) VALUES (${id(5, 1)},${tenant},'Fixture')`
    await tx`INSERT INTO ppe_items (tenant_id,type_id,current_holder_person_id) VALUES (${tenant},${id(5, 1)},${person})`
  })
  for (const [assignment, legacy, property] of [
    [null, 1, 0],
    [legacySite, 1, 0],
    [site, 0, 1],
    [secondSite, 0, 0],
  ] as const) {
    await resetAssignment(assignment)
    for (const [mode, expected] of [
      ['legacy', legacy],
      ['property', property],
      ['tenant', 1],
    ] as const) {
      await reader.begin(async (tx) => {
        await context(tx, mode)
        assert.equal(await visible(tx), expected)
        assert.equal(
          (await tx`SELECT id FROM training_records WHERE tenant_id=${tenant}`).length,
          expected,
        )
        assert.equal(
          (await tx`SELECT id FROM ppe_items WHERE tenant_id=${tenant}`).length,
          expected,
        )
        assert.equal(await visible(tx, id(4, 2)), 0)
      })
    }
  }
  pass(
    'unassigned, legacy, single-property, foreign-property, tenant-wide, cross-tenant, Training and PPE',
  )
  await rejected(
    () =>
      reader.begin(async (tx) => {
        await context(tx, 'property')
        await tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from)
          VALUES (${tenant},${person},${site},current_date)`
      }),
    '42501',
  )
  await reader.begin(async (tx) => {
    await context(tx, 'property', [hotel, secondHotel])
    assert.equal(
      (
        await tx`UPDATE people_assignments SET org_unit_id=${site} WHERE person_id=${person} RETURNING id`
      ).length,
      1,
    )
    assert.equal(
      (
        await tx`UPDATE people_assignments SET org_unit_id=${secondSite} WHERE person_id=${person} RETURNING id`
      ).length,
      1,
    )
    assert.equal(
      (
        await tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from) VALUES (${tenant},${person},${site},current_date) RETURNING id`
      ).length,
      1,
    )
    assert.equal(
      (
        await tx`DELETE FROM people_assignments WHERE person_id=${person} AND org_unit_id=${site} RETURNING id`
      ).length,
      1,
    )
  })
  await writer.begin(async (tx) => {
    await context(tx, 'tenant')
    await tx`INSERT INTO people (id,tenant_id,first_name,last_name) VALUES (${id(4, 3)},${tenant},'Visible','Donor')`
    await tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from)
      VALUES (${tenant},${id(4, 3)},${site},current_date)`
  })
  await rejected(
    () =>
      reader.begin(async (tx) => {
        await context(tx, 'property')
        await tx`UPDATE people_assignments SET person_id=${person} WHERE person_id=${id(4, 3)}`
      }),
    '42501',
  )
  await writer.begin(async (tx) => {
    await context(tx, 'tenant')
    await tx`DELETE FROM people WHERE id=${id(4, 3)}`
  })
  pass('property assignment creation and reassignment cannot claim a hidden Person')
  await writer.begin(async (tx) => {
    await context(tx, 'tenant')
    await tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from) VALUES (${tenant},${person},${legacySite},current_date),(${tenant},${person},${site},current_date)`
  })
  await reader.begin(async (tx) => {
    await context(tx)
    assert.equal(await visible(tx), 0)
  })
  await reader.begin(async (tx) => {
    await context(tx, 'property', [hotel, secondHotel])
    assert.equal(await visible(tx), 1)
  })
  pass('mixed assignments deny legacy; multi-property union preserves access')
  await resetAssignment(site)
  for (const [from, to, expected] of [
    [1, null, 1],
    [-2, -1, 1],
    [0, 0, 0],
    [-1, 0, 0],
    [0, null, 0],
  ] as const) {
    await writer.begin(async (tx) => {
      await context(tx, 'tenant')
      await tx`UPDATE people_assignments SET valid_from=current_date + ${from}::int,
        valid_to=CASE WHEN ${to}::int IS NULL THEN NULL ELSE current_date + ${to}::int END
        WHERE tenant_id=${tenant} AND person_id=${person}`
    })
    await reader.begin(async (tx) => {
      await context(tx)
      assert.equal(await visible(tx), expected)
    })
  }
  pass('future, expired, inclusive start/end and open-ended assignment dates')
  for (const mapping of ['', null, 'not-a-property', foreignHotel, id(2, 99)]) {
    await writer.begin(async (tx) => {
      await context(tx, 'tenant')
      await tx`UPDATE org_units SET metadata=${tx.json({ hospitalityPropertyId: mapping })} WHERE id=${site}`
    })
    for (const mode of ['legacy', 'property'])
      await reader.begin(async (tx) => {
        await context(tx, mode)
        assert.equal(await visible(tx), 0)
        assert.equal((await tx`SELECT id FROM org_units WHERE id=${site}`).length, 0)
        assert.equal(
          (await tx`SELECT id FROM people_assignments WHERE person_id=${person}`).length,
          0,
        )
        assert.equal(
          (await tx`DELETE FROM people_assignments WHERE person_id=${person} RETURNING id`).length,
          0,
        )
      })
  }
  await writer.begin(async (tx) => {
    await context(tx, 'tenant')
    await tx`UPDATE org_units SET metadata=${tx.json({ hospitalityPropertyId: hotel })} WHERE id=${site}`
  })
  pass('empty, null, malformed, foreign and missing property provenance fail closed')
  for (const metadata of ['[]', 'null', '"invalid"']) {
    await writer.begin(async (tx) => {
      await context(tx, 'tenant')
      await tx`UPDATE org_units SET metadata=${metadata}::jsonb WHERE id=${site}`
    })
    await reader.begin(async (tx) => {
      await context(tx)
      assert.equal(await visible(tx), 0)
      assert.equal((await tx`SELECT id FROM org_units WHERE id=${site}`).length, 0)
      assert.equal(
        (await tx`SELECT id FROM people_assignments WHERE person_id=${person}`).length,
        0,
      )
    })
  }
  await writer.begin(async (tx) => {
    await context(tx, 'tenant')
    await tx`UPDATE org_units SET metadata=${tx.json({ hospitalityPropertyId: hotel })} WHERE id=${site}`
  })
  pass('non-object site metadata fails closed')
  await rejected(
    () =>
      reader.begin(async (tx) => {
        await context(tx)
        await tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from) VALUES (${tenant},${person},${site},current_date)`
      }),
    '42501',
  )
  await rejected(
    () =>
      reader.begin(async (tx) => {
        await context(tx, 'tenant')
        await tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from) VALUES (${tenant},${person},${id(3, 99)},current_date)`
      }),
    '23503',
  )
  await rejected(
    () =>
      reader.begin(async (tx) => {
        await context(tx, 'tenant')
        await tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from) VALUES (${tenant},${id(4, 2)},${site},current_date)`
      }),
    '23503',
  )
  await reader.begin(async (tx) => {
    await context(tx)
    assert.equal((await tx`SELECT id FROM people_assignments WHERE person_id=${person}`).length, 0)
    assert.equal(
      (await tx`UPDATE people SET notes='forbidden' WHERE id=${person} RETURNING id`).length,
      0,
    )
    assert.equal((await tx`DELETE FROM people WHERE id=${person} RETURNING id`).length, 0)
    const rows =
      await tx`INSERT INTO people (tenant_id,first_name,last_name) VALUES (${tenant},'New','Unassigned') RETURNING id`
    assert.equal(rows.length, 1)
    assert.equal(
      (
        await tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from) VALUES (${tenant},${rows[0]!.id},${legacySite},current_date) RETURNING id`
      ).length,
      1,
    )
    assert.equal(
      (await tx`DELETE FROM people_assignments WHERE person_id=${rows[0]!.id} RETURNING id`).length,
      1,
    )
    assert.equal(
      (await tx`UPDATE people SET notes='allowed' WHERE id=${rows[0]!.id} RETURNING id`).length,
      1,
    )
    assert.equal((await tx`DELETE FROM people WHERE id=${rows[0]!.id} RETURNING id`).length, 1)
  })
  await rejected(
    () =>
      reader.begin(async (tx) => {
        await context(tx, 'property')
        await tx`INSERT INTO people (tenant_id,first_name,last_name) VALUES (${tenant},'Forbidden','Unassigned')`
      }),
    '42501',
  )
  pass('SELECT/INSERT/UPDATE/DELETE, hidden assignment DML and tenant-qualified foreign keys')
  for (const statement of [
    'SET ROLE beaconhs_owner',
    'CREATE TABLE security.spoof (id int)',
    'CREATE OR REPLACE FUNCTION security.person_allows_scope(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$',
    'ALTER TABLE public.people_assignments DISABLE TRIGGER people_assignments_person_provenance_lock',
    'TRUNCATE public.people_assignments',
  ]) {
    await rejected(() => reader.unsafe(statement), '42501')
  }
  await reader.begin(async (tx) => {
    await context(tx)
    assert.equal(
      (
        await tx`SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user`
      )[0]!.rolsuper,
      false,
    )
    assert.equal(
      (await tx`SELECT security.person_allows_scope(${foreignTenant},${id(4, 2)}) AS allowed`)[0]!
        .allowed,
      false,
    )
    await tx`SELECT set_config('app.tenant_id','',true)`
    assert.equal(
      (await tx`SELECT security.person_allows_scope(${tenant},${person}) AS allowed`)[0]!.allowed,
      false,
    )
  })
  const contract =
    await admin`SELECT p.prosecdef,p.provolatile,p.proconfig,p.prorettype::regtype::text AS result,
    r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolname FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.oid='security.person_allows_scope(uuid,uuid)'::regprocedure`
  assert.equal(contract[0]!.result, 'boolean')
  assert.equal(contract[0]!.prosecdef, true)
  assert.equal(contract[0]!.provolatile, 'v')
  assert.equal(contract[0]!.rolname, 'beaconhs_owner')
  for (const key of ['rolcanlogin', 'rolsuper', 'rolbypassrls'])
    assert.equal(contract[0]![key], false)
  assert.deepEqual(contract[0]!.proconfig, ['search_path=pg_catalog, pg_temp', 'row_security=on'])
  assert.equal(
    (
      await admin`SELECT 1 FROM pg_proc p,
    LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE p.oid='security.person_allows_scope(uuid,uuid)'::regprocedure
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE'`
    ).length,
    0,
  )
  assert.equal(
    (
      await admin`SELECT has_function_privilege('beaconhs_app',
    'security.lock_person_provenance_write()', 'EXECUTE') AS allowed`
    )[0]!.allowed,
    false,
  )
  assert.equal(
    (
      await admin`SELECT prosecdef FROM pg_proc
    WHERE oid='security.lock_person_provenance_write()'::regprocedure`
    )[0]!.prosecdef,
    false,
  )
  assert.equal(
    (
      await admin`SELECT 1 FROM pg_class WHERE oid IN ('people'::regclass,'people_assignments'::regclass,'org_units'::regclass) AND (NOT relrowsecurity OR NOT relforcerowsecurity)`
    ).length,
    0,
  )
  await admin.begin(async (tx) => {
    await tx`SET LOCAL ROLE beaconhs_owner`
    await context(tx)
    assert.equal((await tx`SELECT id FROM org_units WHERE tenant_id=${foreignTenant}`).length, 0)
    assert.equal(
      (await tx`SELECT id FROM people_assignments WHERE tenant_id=${foreignTenant}`).length,
      0,
    )
  })
  pass(
    'function owner/search_path/FORCE RLS/boolean contract and runtime privilege escalation denials',
  )

  // Writer-first schedules: deliberately start the reader before writer commit
  // and prove it waits; mere timing guesses are insufficient evidence.
  const cases: Array<{
    name: string
    initial: string | null
    change: (tx: TransactionSql) => Promise<unknown>
    expected: number
    mode?: string
    rollback?: boolean
  }> = [
    {
      name: 'assignment creation',
      initial: null,
      change: (tx) =>
        tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from) VALUES (${tenant},${person},${site},current_date)`,
      expected: 0,
    },
    {
      name: 'assignment reassignment',
      initial: legacySite,
      change: (tx) =>
        tx`UPDATE people_assignments SET org_unit_id=${site} WHERE person_id=${person}`,
      expected: 0,
    },
    {
      name: 'assignment deletion',
      initial: site,
      change: (tx) => tx`DELETE FROM people_assignments WHERE person_id=${person}`,
      expected: 1,
    },
    {
      name: 'assignment rollback',
      initial: null,
      change: (tx) =>
        tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from) VALUES (${tenant},${person},${site},current_date)`,
      expected: 1,
      rollback: true,
    },
    {
      name: 'site remapping',
      initial: legacySite,
      change: (tx) =>
        tx`UPDATE org_units SET metadata=${tx.json({ hospitalityPropertyId: hotel })} WHERE id=${legacySite}`,
      expected: 0,
    },
    {
      name: 'property reassignment',
      initial: site,
      change: (tx) =>
        tx`UPDATE people_assignments SET org_unit_id=${secondSite} WHERE person_id=${person}`,
      expected: 0,
      mode: 'property',
    },
    {
      name: 'property deletion',
      initial: site,
      change: (tx) => tx`UPDATE hospitality_properties SET deleted_at=now() WHERE id=${hotel}`,
      expected: 0,
      mode: 'property',
    },
  ]
  for (const test of cases) {
    await resetAssignment(test.initial)
    const changed = latch()
    const release = latch()
    const rollback = new Error('intentional fixture rollback')
    const write = writer
      .begin(async (tx) => {
        await context(tx, 'tenant')
        await test.change(tx)
        changed.release()
        await release.promise
        if (test.rollback) throw rollback
      })
      .catch((error) => {
        if (error !== rollback) throw error
      })
    const started = latch()
    let pid = 0
    let read: Promise<unknown> | undefined
    try {
      await changed.promise
      read = reader.begin(async (tx) => {
        await context(tx, test.mode ?? 'legacy')
        pid = (await tx`SELECT pg_backend_pid() AS pid`)[0]!.pid
        started.release()
        assert.equal(await visible(tx), test.expected)
      })
      await started.promise
      await waitForLock(pid)
    } finally {
      release.release()
    }
    await Promise.all([write, read])
    await writer.begin(async (tx) => {
      await context(tx, 'tenant')
      await tx`UPDATE org_units SET metadata='{}' WHERE id=${legacySite}`
      await tx`UPDATE hospitality_properties SET deleted_at=NULL WHERE id=${hotel}`
    })
    pass(`concurrent writer-first ${test.name}: observed lock wait and fresh authorization`)
  }
  await resetAssignment()
  const held = latch()
  const release = latch()
  const started = latch()
  let pid = 0
  const read = reader.begin(async (tx) => {
    await context(tx)
    assert.equal((await tx`SELECT id FROM people WHERE id=${person} FOR UPDATE`).length, 1)
    held.release()
    await release.promise
    assert.equal(
      (await tx`UPDATE people SET notes='serialized legacy write' WHERE id=${person} RETURNING id`)
        .length,
      1,
    )
  })
  await held.promise
  const write = writer.begin(async (tx) => {
    await context(tx, 'tenant')
    pid = (await tx`SELECT pg_backend_pid() AS pid`)[0]!.pid
    started.release()
    await tx`INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from) VALUES (${tenant},${person},${site},current_date)`
  })
  try {
    await started.promise
    await waitForLock(pid)
    await other.begin(async (tx) => {
      await context(tx, 'property', [foreignHotel], foreignTenant)
      assert.equal(await visible(tx, id(4, 2)), 1)
    })
  } finally {
    release.release()
  }
  await Promise.all([read, write])
  await reader.begin(async (tx) => {
    await context(tx)
    assert.equal(await visible(tx), 0)
  })
  pass(
    'reader-first SELECT FOR UPDATE and mutation serialize; other tenant continues independently',
  )
  for (const isolation of ['repeatable read', 'serializable']) {
    await rejected(
      () =>
        reader.begin(`isolation level ${isolation}`, async (tx) => {
          await context(tx)
          await visible(tx)
        }),
      '0A000',
    )
  }
  pass('fixed-snapshot isolation fails closed')
  // A stale assignment DELETE must not erase hotel provenance after waiting
  // for a concurrent site remapping and thereby make the Person legacy again.
  await resetAssignment(legacySite)
  const remapped = latch()
  const finishRemap = latch()
  const deleting = latch()
  let deletePid = 0
  const remap = writer.begin(async (tx) => {
    await context(tx, 'tenant')
    await tx`UPDATE org_units SET metadata=${tx.json({ hospitalityPropertyId: hotel })} WHERE id=${legacySite}`
    remapped.release()
    await finishRemap.promise
  })
  await remapped.promise
  const staleDelete = rejected(
    () =>
      reader.begin(async (tx) => {
        await context(tx)
        deletePid = (await tx`SELECT pg_backend_pid() AS pid`)[0]!.pid
        deleting.release()
        await tx`DELETE FROM people_assignments WHERE person_id=${person}`
      }),
    '42501',
  )
  try {
    await deleting.promise
    await waitForLock(deletePid)
  } finally {
    finishRemap.release()
  }
  await Promise.all([remap, staleDelete])
  await reader.begin(async (tx) => {
    await context(tx)
    assert.equal(await visible(tx), 0)
  })
  pass('stale legacy assignment deletion cannot erase newly committed hotel provenance')
  await resetAssignment(site)
  await writer.begin(async (tx) => {
    await context(tx, 'tenant')
    await tx`DELETE FROM org_units WHERE id=${site}`
    await context(tx)
    assert.equal(await visible(tx), 1)
  })
  pass('same-transaction site cascade removes authoritative assignments without stale eligibility')
  console.log(`People provenance integration: ${passed} groups PASS`)
} finally {
  await Promise.all([
    reader.end({ timeout: 1 }),
    writer.end({ timeout: 1 }),
    other.end({ timeout: 1 }),
  ])
  await admin`DELETE FROM tenants WHERE id IN (${tenant},${foreignTenant})`
  assert.equal(
    (await admin`SELECT 1 FROM tenants WHERE id IN (${tenant},${foreignTenant})`).length,
    0,
  )
  await admin.end({ timeout: 1 })
}

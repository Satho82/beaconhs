// Disposable PostgreSQL only; no live URLs are accepted by this harness.
import assert from 'node:assert/strict'
import { db, withTenant } from '@beaconhs/db'
import { auditLog } from '@beaconhs/db/schema'
import {
  beginSave,
  commitSave,
  failSave,
  saveStatus,
  settleSave,
} from '../src/lib/wopi-save-telemetry'
import type { WopiGrant } from '../src/lib/wopi'

async function main() {
  assert.equal(process.env.UVANOO_SYNTHETIC_TEST, 'wopi-20261013')
  assert.equal(process.env.DATABASE_URL, 'postgresql://wopi_app@127.0.0.1:5432/beaconhs')
  assert.equal(process.env.SUPERADMIN_DATABASE_URL, 'postgresql://postgres@127.0.0.1:5432/beaconhs')
  const tenantA = '00000000-0000-4000-8000-000000000001'
  const tenantB = '00000000-0000-4000-8000-000000000002'
  const grant = (tenantId: string) => ({ tenantId, userId: 'synthetic-user' }) as WopiGrant
  const a = await beginSave(grant(tenantA))
  assert.ok(a)
  assert.equal((await saveStatus()).inFlight, 1)
  assert.equal((await withTenant(db, tenantB, (tx) => tx.select().from(auditLog))).length, 0)
  await assert.rejects(withTenant(db, tenantB, (tx) => commitSave(tx, a)))
  await assert.rejects(
    withTenant(db, tenantA, async (tx) => {
      await commitSave(tx, a)
      throw new Error('synthetic attachment transaction rollback')
    }),
  )
  assert.equal((await saveStatus()).inFlight, 1)
  await withTenant(db, tenantA, (tx) => commitSave(tx, a))
  assert.equal((await saveStatus()).inFlight, 1)
  await settleSave(a)
  assert.equal((await saveStatus()).completedSaves, 1)
  await assert.rejects(withTenant(db, tenantA, (tx) => commitSave(tx, a)))
  const b = await beginSave(grant(tenantB))
  await failSave(b)
  const crashed = await beginSave(grant(tenantB))
  assert.ok(crashed)
  const status = await saveStatus()
  assert.equal(status.inFlight, 1)
  assert.equal(status.failedSaves, 1)
  assert.equal(status.completedSaves, 1)
  assert.equal(status.unknownOutcomes, 0)
  assert.equal(status.eventCount, 6)
  assert.equal(status.drainageProven, false)
  await withTenant(db, tenantA, (tx) =>
    tx.insert(auditLog).values({
      tenantId: tenantA,
      entityType: 'wopi_save_dev_v1',
      action: 'update',
      metadata: { composeId: 'invalid-binding' },
    }),
  )
  await assert.rejects(saveStatus())
  console.log(
    JSON.stringify({
      result: 'PASS',
      checks: [
        'durable-begin',
        'tenant-read-isolation',
        'tenant-write-isolation',
        'transaction-rollback-preserves-inflight',
        'atomic-success',
        'deduplication',
        'durable-failure',
        'crash-remains-inflight',
        'aggregate-readonly-status',
        'malformed-ledger-fails-closed',
        'cleanup-finish-required-for-drainage',
      ],
    }),
  )
}
main().then(
  () => process.exit(0),
  () => {
    console.error('SYNTHETIC_WOPI_TEST_FAILED')
    process.exit(1)
  },
)

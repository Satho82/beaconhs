import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./_actions.ts', import.meta.url), 'utf8')

describe('General Settings audit contract', () => {
  it('writes the tenant update and its audit event in one privileged transaction', () => {
    const action = source.slice(source.indexOf('export async function saveSettings'))
    const transactionStart = action.indexOf('await withSuperAdmin(db, async (tx) => {')
    const transactionEnd = action.indexOf('\n  })\n\n  revalidatePath', transactionStart)
    const transaction = action.slice(transactionStart, transactionEnd)

    expect(transactionStart).toBeGreaterThanOrEqual(0)
    expect(transactionEnd).toBeGreaterThan(transactionStart)
    expect(transaction).toContain('.update(tenants)')
    expect(transaction).toContain('recordAuditInTransaction(tx, ctx,')
    expect(transaction.indexOf('recordAuditInTransaction(tx, ctx,')).toBeGreaterThan(
      transaction.indexOf('.update(tenants)'),
    )
    expect(action).not.toContain('recordAudit(ctx,')
  })
})

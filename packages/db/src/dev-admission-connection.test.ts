import { expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import type { MigrationDatabase } from './migration-connection'
import { admissionConnection } from './dev-admission-connection'

it('rejects the next statement after expiry and preserves rollback', async () => {
  const events: string[] = []
  let active = true
  const base: MigrationDatabase = {
    async execute() {
      events.push('statement')
      active = false
      return []
    },
    async transaction<T>(fn: (tx: MigrationDatabase) => Promise<T>): Promise<T> {
      events.push('begin')
      try {
        const value = await fn(base)
        events.push('commit')
        return value
      } catch (error) {
        events.push('rollback')
        throw error
      }
    },
  }
  const guarded = admissionConnection(base, () => {
    if (!active) throw new Error('expired')
  })
  await expect(
    guarded.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1`)
      await tx.execute(sql`SELECT 2`)
    }),
  ).rejects.toThrow('expired')
  expect(events).toEqual(['begin', 'statement', 'rollback'])
  await expect(guarded.execute(sql`SELECT 3`)).rejects.toThrow('expired')
  expect(events).toEqual(['begin', 'statement', 'rollback'])
})
it('preserves transaction results and commit while admission stays valid', async () => {
  let checks = 0,
    commits = 0
  const base: MigrationDatabase = {
    async execute() {
      return [{ ok: true }]
    },
    async transaction<T>(fn: (tx: MigrationDatabase) => Promise<T>) {
      const result = await fn(base)
      commits++
      return result
    },
  }
  const result = await admissionConnection(base, () => {
    checks++
  }).transaction((tx) => tx.execute(sql`SELECT 1`))
  expect(result).toEqual([{ ok: true }])
  expect(commits).toBe(1)
  expect(checks).toBe(4)
})

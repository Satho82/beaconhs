import { sql, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type postgres from 'postgres'

export interface MigrationDatabase {
  execute(query: SQL): Promise<Record<string, unknown>[]>
  transaction<T>(callback: (transaction: MigrationDatabase) => Promise<T>): Promise<T>
}

/** A reserved postgres.js connection has no begin() API. Use explicit boundaries
 * on that physical connection, retaining session role and advisory locks.
 * Nested/concurrent transactions are deliberately rejected in this serial runner.
 */
export function pinnedMigrationDatabase(connection: postgres.ReservedSql): MigrationDatabase {
  const dialect = new PgDialect()
  let transactionActive = false
  const db: MigrationDatabase = {
    async execute(query) {
      const compiled = dialect.sqlToQuery(query)
      const parameters = compiled.params.map((value) => {
        if (typeof value === 'bigint') return value.toString()
        if (
          value === null ||
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value instanceof Date ||
          Buffer.isBuffer(value)
        )
          return value
        throw new Error('Unsupported migration query parameter')
      })
      return await connection.unsafe(compiled.sql, parameters)
    },
    async transaction<T>(callback: (transaction: MigrationDatabase) => Promise<T>) {
      if (transactionActive) throw new Error('Nested/concurrent migration transaction refused')
      transactionActive = true
      try {
        await db.execute(sql`BEGIN`)
        try {
          const result = await callback(db)
          await db.execute(sql`COMMIT`)
          return result
        } catch (error) {
          try {
            await db.execute(sql`ROLLBACK`)
          } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'Migration failed and rollback failed')
          }
          throw error
        }
      } finally {
        transactionActive = false
      }
    },
  }
  return db
}

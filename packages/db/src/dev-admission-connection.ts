import type { MigrationDatabase } from './migration-connection'

/** Check every statement admission and transaction completion, not just process startup.
 * The underlying transaction retains unconditional ROLLBACK/connection cleanup.
 * An in-flight PostgreSQL statement is not killed; expired admission rejects the
 * next statement/commit boundary and rolls back the current transaction. */
export function admissionConnection(db: MigrationDatabase, admit: () => void): MigrationDatabase {
  return {
    async execute(statement) {
      admit()
      const rows = await db.execute(statement)
      admit()
      return rows
    },
    async transaction<T>(callback: (tx: MigrationDatabase) => Promise<T>): Promise<T> {
      admit()
      return db.transaction(async (tx) => {
        const result = await callback(admissionConnection(tx, admit))
        admit()
        return result
      })
    },
  }
}

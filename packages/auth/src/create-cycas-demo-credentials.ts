import { randomBytes } from 'node:crypto'
import { open, realpath } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import {
  assertCycasSeedEnvironment,
  buildCycasDemoSeedPlan,
} from '@beaconhs/db/cycas-demo-seed-plan'

// Offline DEV-only provisioning. No database connection, no password output,
// no overwriting an existing secret file. The seed inserts hashes transactionally.
assertCycasSeedEnvironment(process.env)
const path = process.env.UVANOO_CYCAS_CREDENTIAL_FILE
if (
  !path ||
  !path.startsWith('/') ||
  resolve(path).startsWith(resolve(import.meta.dirname, '../../..') + '/')
)
  throw new Error('Use an absolute credential file path outside the repository')
if (
  (await realpath(dirname(path))).startsWith(
    await realpath(resolve(import.meta.dirname, '../../..')),
  )
)
  throw new Error('Credential file must be outside the repository')
const file = await open(path, 'wx', 0o600)
try {
  const credentials: Record<string, { password: string; passwordHash: string }> = {}
  for (const member of buildCycasDemoSeedPlan().staff) {
    const password = randomBytes(24).toString('base64url')
    credentials[member.email] = { password, passwordHash: await hashPassword(password) }
  }
  await file.writeFile(JSON.stringify(credentials))
  await file.sync()
  console.log('Owner-only Cycas DEV credential file created; no database changes.')
} finally {
  await file.close()
}

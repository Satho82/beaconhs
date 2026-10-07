import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { createSuperClient } from './client'
import {
  assertCycasSeedEnvironment,
  buildCycasDemoSeedPlan,
  CYCAS_BOARD_ANCHOR,
} from './cycas-demo-seed-plan'
import { seedCycasDemo } from './cycas-demo-seed-runner'

assertCycasSeedEnvironment(process.env)
const anchor = new Date(process.env.UVANOO_CYCAS_SEED_ANCHOR ?? CYCAS_BOARD_ANCHOR)
if (Number.isNaN(anchor.getTime())) throw new Error('Invalid Cycas seed anchor')
const plan = buildCycasDemoSeedPlan(anchor)
if (process.env.UVANOO_CYCAS_SEED_DRY_RUN === '1') {
  console.log(JSON.stringify({ anchor: anchor.toISOString(), expected: plan.expected }, null, 2))
} else {
  const { db, sql: pg } = createSuperClient({ max: 1 })
  try {
    const result = await seedCycasDemo(db, plan, async () => {
      const path = process.env.UVANOO_CYCAS_CREDENTIAL_FILE
      if (!path) throw new Error('UVANOO_CYCAS_CREDENTIAL_FILE is required for first insertion')
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const stat = await file.stat()
        if (
          !stat.isFile() ||
          stat.size > 65536 ||
          (stat.mode & 0o077) !== 0 ||
          stat.uid !== process.getuid?.()
        )
          throw new Error('Credential file must be owner-only, owned by this process user')
        const credentials = JSON.parse(await file.readFile('utf8')) as Record<
          string,
          { passwordHash: string }
        >
        return Object.fromEntries(
          Object.entries(credentials).map(([email, entry]) => [email, entry.passwordHash]),
        )
      } finally {
        await file.close()
      }
    })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(
      error instanceof Error &&
        /^(Cycas (collision|manifest|seed|insertion)|Credential file|UVANOO_CYCAS_CREDENTIAL_FILE)/.test(
          error.message,
        )
        ? error.message
        : 'Cycas seed failed; no query parameters logged',
    )
    process.exitCode = 1
  } finally {
    await pg.end()
  }
}

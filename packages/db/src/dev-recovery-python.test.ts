import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { it } from 'vitest'

it('enforces the DEV recovery adapter failure tests', () => {
  const directory = fileURLToPath(
    new URL('../../../scripts/cluster/dev-recovery/', import.meta.url),
  )
  execFileSync(
    'python3',
    ['-B', '-m', 'unittest', 'discover', '-s', directory, '-p', 'test_*.py'],
    {
      encoding: 'utf8',
      timeout: 20_000,
      stdio: 'pipe',
    },
  )
})

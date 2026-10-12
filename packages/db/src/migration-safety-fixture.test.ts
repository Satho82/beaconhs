import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('pins the approved test-only Approvals security contract without a sibling checkout', () => {
  const fixture = readFileSync(
    new URL('./test/approvals-security-contract.fixture.sql', import.meta.url),
  )
  expect(createHash('sha256').update(fixture).digest('hex')).toBe(
    '9d7e47851e1ddf38335826fe0160099e8839d542d18505f141f36653da8c7780',
  )
  const harness = readFileSync(
    new URL('./migration-safety.integration.ts', import.meta.url),
    'utf8',
  )
  expect(harness).not.toContain('../../../../approvals/')
  expect(harness).toContain('./test/approvals-security-contract.fixture.sql')
})

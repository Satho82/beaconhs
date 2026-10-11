import { describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@beaconhs/tenant'
import {
  isRiskSchemaReady,
  requireRiskSchemaReady,
  riskSchemaUnavailableResponse,
} from './risk-schema-readiness'

function context(ready: boolean) {
  const execute = vi.fn().mockResolvedValue([{ ready }])
  const db = vi.fn(async (work: (tx: { execute: typeof execute }) => Promise<unknown>) =>
    work({ execute }),
  )
  return { ctx: { db } as unknown as Pick<RequestContext, 'db'>, execute }
}

describe('Risk schema activation on the 0058 baseline', () => {
  it('fails closed before Risk data access when the new schema is absent', async () => {
    const { ctx, execute } = context(false)
    await expect(isRiskSchemaReady(ctx)).resolves.toBe(false)
    await expect(requireRiskSchemaReady(ctx)).rejects.toThrow('unavailable')
    expect(execute).toHaveBeenCalledTimes(2)
    const query = execute.mock.calls[0]?.[0]
    expect(query).toBeDefined()
    const response = riskSchemaUnavailableResponse()
    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).not.toContain('risk_template_families')
  })

  it('allows Risk operations only when the physical schema check succeeds', async () => {
    const { ctx } = context(true)
    await expect(requireRiskSchemaReady(ctx)).resolves.toBeUndefined()
  })
})

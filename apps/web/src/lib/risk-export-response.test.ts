import { describe, expect, it } from 'vitest'
import { ForbiddenError, ImpersonationBlockedError } from '@beaconhs/tenant'
import { riskExportResponse } from './risk-export-response'

describe('risk export denials', () => {
  it.each([
    new ForbiddenError('admin.data.export'),
    new ForbiddenError('property'),
    new ImpersonationBlockedError('export'),
  ])('returns a private controlled denial for %s', async (error) => {
    const response = await riskExportResponse(async () => {
      throw error
    })
    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-disposition')).toBeNull()
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })

  it('preserves successful downloads and propagates failures and authentication redirects', async () => {
    const download = new Response('reference,title', { headers: { 'content-type': 'text/csv' } })
    expect(await riskExportResponse(async () => download)).toBe(download)
    for (const error of [
      new Error('database unavailable'),
      Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' }),
    ]) {
      await expect(
        riskExportResponse(async () => {
          throw error
        }),
      ).rejects.toBe(error)
    }
  })
})

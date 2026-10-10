import { describe, expect, it } from 'vitest'
import { riskPdfAttachmentResponse } from './risk-pdf-response'

describe('Risk PDF downloads', () => {
  it('returns non-empty PDF bytes with a safe attachment filename', async () => {
    const response = await riskPdfAttachmentResponse(
      new Response('%PDF-1.7\nfixture', { headers: { 'Content-Type': 'application/pdf' } }),
      'risk-assessment/RA:001.pdf',
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="risk-assessment_RA_001.pdf"',
    )
    expect(await response.text()).toMatch(/^%PDF-/)
  })

  it('rejects successful empty or non-PDF worker responses', async () => {
    const empty = await riskPdfAttachmentResponse(
      new Response('', { headers: { 'Content-Type': 'application/pdf' } }),
      'register.pdf',
    )
    expect(empty.status).toBe(502)
    const wrongType = await riskPdfAttachmentResponse(
      new Response('not a pdf', { headers: { 'Content-Type': 'text/html' } }),
      'register.pdf',
    )
    expect(wrongType.status).toBe(502)
  })

  it('passes through worker errors without converting them into empty downloads', async () => {
    const failure = new Response('worker unavailable', { status: 502 })
    expect(await riskPdfAttachmentResponse(failure, 'register.pdf')).toBe(failure)
  })
})

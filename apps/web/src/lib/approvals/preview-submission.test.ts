import { describe, expect, it } from 'vitest'
import { previewSubmission } from './preview-submission'
import { PREVIEW_PROPERTY } from './preview-fixtures'
const valid = {
  title: 'Synthetic test',
  description: 'Test description',
  category: 'Maintenance',
  propertyId: PREVIEW_PROPERTY,
  amount: 12.34,
  currency: 'GBP',
  supplier: '',
  workflowId: '95b47f24-995f-449e-aa5c-d988322e8fbf',
  idempotencyKey: 'a3300000-0000-4000-8000-000000000999',
}
describe('preview request validation', () => {
  it('accepts complete synthetic input', () =>
    expect(previewSubmission.parse(valid)).toEqual(valid))
  it.each([
    { title: '' },
    { title: '  ' },
    { description: '' },
    { category: 'Risk' },
    { propertyId: 'a3300000-0000-4000-8000-000000000099' },
    { amount: 0 },
    { amount: -1 },
    { amount: 1.234 },
    { amount: Infinity },
    { currency: 'XXX' },
    { tenantId: 'foreign' },
    { workflowId: 'invalid' },
  ])('rejects invalid input %j', (change) =>
    expect(previewSubmission.safeParse({ ...valid, ...change }).success).toBe(false),
  )
})

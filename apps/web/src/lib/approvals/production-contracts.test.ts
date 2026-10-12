import { describe, it, expect } from 'vitest'
import {
  moneyInput,
  amountMinor,
  documentType,
  financialInput,
  activityInput,
  productionWorkflowInput,
} from './production-contracts'
import { workflowInput } from './contracts'
const id = '10000000-0000-4000-8000-000000000001'
describe('Production financial boundaries', () => {
  it('preserves exact minor units and rejects rounding, exponent and nonpositive values', () => {
    expect(amountMinor(moneyInput.parse('99999999999999.99'))).toBe(9999999999999999n)
    expect(amountMinor(moneyInput.parse('0.01'))).toBe(1n)
    for (const v of [
      '0',
      '0.00',
      '-1',
      'NaN',
      'Infinity',
      '1e4',
      '1.001',
      '01.50',
      ' 1',
      '1,000',
      '100000000000000',
    ])
      expect(moneyInput.safeParse(v).success).toBe(false)
  })
  it('requires the actual supported document signature', () => {
    expect(documentType(new TextEncoder().encode('%PDF-1.7'))).toBe('application/pdf')
    expect(documentType(new Uint8Array([255, 216, 255, 0]))).toBe('image/jpeg')
    expect(documentType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png')
    expect(() => documentType(new TextEncoder().encode('<svg onload="alert(1)">'))).toThrow()
    expect(() => documentType(new Uint8Array())).toThrow()
  })
  it('refuses client-owned tenant, requester and storage authority', () => {
    const input = {
      workflowId: id,
      title: 'Invoice',
      category: 'Maintenance',
      amount: '15.50',
      currency: 'GBP',
      supplier: 'Supplier',
      description: 'Repair',
      idempotencyKey: id,
    }
    expect(financialInput.safeParse(input).success).toBe(true)
    for (const key of ['tenantId', 'requesterId', 'status', 'sourceId', 'objectKey'])
      expect(financialInput.safeParse({ ...input, [key]: id }).success).toBe(false)
    expect(financialInput.safeParse({ ...input, currency: 'XYZ' }).success).toBe(false)
  })
  it('requires explicit delegation target and stale-assignment token', () => {
    const input = {
      requestId: id,
      kind: 'delegate',
      body: 'Holiday cover',
      targetId: id,
      stage: 1,
      assignmentVersion: 0,
      idempotencyKey: id,
    }
    expect(activityInput.safeParse(input).success).toBe(true)
    expect(activityInput.safeParse({ ...input, targetId: undefined }).success).toBe(false)
    expect(activityInput.safeParse({ ...input, kind: 'comment' }).success).toBe(false)
    expect(activityInput.safeParse({ ...input, assignmentVersion: -1 }).success).toBe(false)
  })
  it('requires role-bound per-stage limits', () => {
    const input = {
      propertyId: id,
      name: 'Maintenance',
      category: 'Maintenance',
      currency: 'GBP',
      maximumAmount: '100',
      reminderHours: 24,
      stages: [{ name: 'GM', approverId: id, roleId: id, maximumAmount: '100' }],
    }
    expect(productionWorkflowInput.safeParse(input).success).toBe(true)
    expect(
      workflowInput.safeParse({
        propertyId: id,
        name: 'Decimal authority',
        stages: [{ name: 'GM', approverId: id, roleId: id, maximumAmount: '100.01' }],
      }).success,
    ).toBe(true)
    expect(
      productionWorkflowInput.safeParse({ ...input, stages: [{ name: 'GM', approverId: id }] })
        .success,
    ).toBe(false)
    expect(productionWorkflowInput.safeParse({ ...input, reminderHours: 0 }).success).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { decisionInput, requestInput, sourceModule, workflowInput } from './contracts'

const id = '10000000-0000-4000-8000-000000000001'
const decision = { requestId: id, stage: 1, decision: 'approve', idempotencyKey: id }
const stage = { name: 'Review', approverId: id }
describe('Approvals server contracts', () => {
  it('accepts the six approved source module contracts only', () => {
    expect(sourceModule.options).toEqual([
      'risk',
      'maintenance',
      'compliance',
      'assets_ppm',
      'people',
      'tasks',
    ])
    expect(sourceModule.safeParse('flow_gates').success).toBe(false)
  })
  it('requires nonblank trimmed rejection reasons', () => {
    expect(decisionInput.safeParse({ ...decision, decision: 'reject' }).success).toBe(false)
    expect(decisionInput.safeParse({ ...decision, decision: 'reject', reason: '  ' }).success).toBe(
      false,
    )
    expect(
      decisionInput.parse({ ...decision, decision: 'reject', reason: '  Missing proof  ' }).reason,
    ).toBe('Missing proof')
  })
  it('permits optional approval comments and bounds their length', () => {
    expect(decisionInput.parse(decision).reason).toBe('')
    expect(decisionInput.safeParse({ ...decision, reason: 'x'.repeat(4001) }).success).toBe(false)
  })
  it('rejects client-supplied tenant, actor and state fields', () => {
    for (const field of ['tenantId', 'actorId', 'status', 'auditId']) {
      expect(decisionInput.safeParse({ ...decision, [field]: id }).success).toBe(false)
    }
  })
  it('requires an explicit bounded integer stage for safe retries', () => {
    for (const value of [0, 21, 1.5, '1', undefined]) {
      expect(decisionInput.safeParse({ ...decision, stage: value }).success).toBe(false)
    }
  })
  it('supports one to twenty ordered stages', () => {
    const input = { propertyId: id, name: 'Review', stages: [stage] }
    expect(workflowInput.safeParse(input).success).toBe(true)
    expect(workflowInput.safeParse({ ...input, stages: [] }).success).toBe(false)
    expect(workflowInput.safeParse({ ...input, stages: Array(20).fill(stage) }).success).toBe(true)
    expect(workflowInput.safeParse({ ...input, stages: Array(21).fill(stage) }).success).toBe(false)
  })
  it('requires versioned UUID source and idempotency references', () => {
    const input = {
      workflowId: id,
      source: { module: 'tasks', id, version: 'v1' },
      idempotencyKey: id,
    }
    expect(requestInput.safeParse(input).success).toBe(true)
    expect(
      requestInput.safeParse({ ...input, source: { ...input.source, version: '' } }).success,
    ).toBe(false)
    expect(requestInput.safeParse({ ...input, idempotencyKey: 'unstable' }).success).toBe(false)
  })
})

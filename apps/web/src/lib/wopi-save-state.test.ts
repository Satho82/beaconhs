import { describe, expect, it } from 'vitest'
import {
  DEV_COMPOSE,
  MAX_SAVE_EVENTS,
  recoveryConfig,
  summarizeSaves,
  type SaveEvent,
} from './wopi-save-state'

const event = (
  id: string,
  phase: string,
  tenantId = 'tenant-a',
  entityId = 'attempt',
): SaveEvent => ({
  id,
  tenantId,
  entityId,
  metadata: {
    version: 1,
    composeId: DEV_COMPOSE,
    epoch: 'a'.repeat(64),
    producer: '00000000-0000-4000-8000-000000000001',
    phase,
  },
})

describe('durable WOPI event reduction', () => {
  it('keeps crashed attempts in flight without a terminal event', () => {
    expect(summarizeSaves([event('1', 'begin')]).inFlight).toBe(1)
  })
  it('retains failed saves even after another retry succeeds', () => {
    const state = summarizeSaves([
      event('1', 'begin'),
      event('2', 'failed'),
      event('3', 'begin', 'tenant-a', 'retry'),
      event('4', 'committed', 'tenant-a', 'retry'),
      event('5', 'settled', 'tenant-a', 'retry'),
    ])
    expect(state.failedSaves).toBe(1)
    expect(state.completedSaves).toBe(1)
  })
  it('does not match attempts across tenants', () => {
    const state = summarizeSaves([event('1', 'begin'), event('2', 'committed', 'tenant-b')])
    expect(state.inFlight).toBe(1)
    expect(state.unknownOutcomes).toBe(1)
  })
  it('rejects contradictory terminal outcomes as unknown', () => {
    expect(
      summarizeSaves([event('1', 'begin'), event('2', 'committed'), event('3', 'failed')])
        .unknownOutcomes,
    ).toBe(1)
  })
  it('retains failed cleanup without claiming drainage', () => {
    expect(
      summarizeSaves([event('1', 'begin'), event('2', 'committed'), event('3', 'cleanup_failed')])
        .failedSaves,
    ).toBe(1)
  })
  it('keeps a committed save in flight until cleanup status is durable', () => {
    expect(summarizeSaves([event('1', 'begin'), event('2', 'committed')]).inFlight).toBe(1)
    expect(
      summarizeSaves([event('1', 'begin'), event('2', 'committed'), event('3', 'settled')])
        .inFlight,
    ).toBe(0)
  })
  it('has deterministic order-independent complete-set watermark', () => {
    const events = [event('1', 'begin'), event('2', 'committed')]
    expect(summarizeSaves(events).completionWatermark).toBe(
      summarizeSaves([...events].reverse()).completionWatermark,
    )
    expect(summarizeSaves(events).completionWatermark).not.toBe(
      summarizeSaves(events.slice(0, 1)).completionWatermark,
    )
    expect(JSON.stringify(summarizeSaves(events))).not.toContain('tenant-a')
  })
  it('fails closed on truncated ledger', () => {
    expect(() =>
      summarizeSaves(
        Array.from({ length: MAX_SAVE_EVENTS + 1 }, (_, i) => event(String(i), 'begin')),
      ),
    ).toThrow()
  })
  it('rejects malformed, duplicate and foreign records', () => {
    expect(() => summarizeSaves([event('1', 'begin'), event('2', 'begin')])).toThrow()
    expect(() => summarizeSaves([event('1', 'unrecognized')])).toThrow()
    const invalid = event('1', 'begin')
    invalid.metadata.composeId = 'legacy'
    expect(() => summarizeSaves([invalid])).toThrow()
  })
  it('does not silently discard a previous epoch', () => {
    const old = event('1', 'begin')
    old.metadata.epoch = 'b'.repeat(64)
    expect(summarizeSaves([old]).inFlight).toBe(1)
  })
})

describe('exact DEV opt-in', () => {
  const env = {
    UVANOO_WOPI_RECOVERY_EPOCH: 'a'.repeat(64),
    UVANOO_RECOVERY_COMPOSE_ID: DEV_COMPOSE,
    BETTER_AUTH_URL: 'https://dev.uvanoo.com',
    UVANOO_RECOVERY_SOURCE_SHA: 'b'.repeat(40),
  }
  it('leaves unconfigured deployments unchanged', () => expect(recoveryConfig({})).toBeNull())
  it('requires complete binding', () =>
    expect(() => recoveryConfig({ UVANOO_RECOVERY_COMPOSE_ID: DEV_COMPOSE })).toThrow())
  it('accepts only exact dev domain and compose', () => {
    expect(recoveryConfig(env)?.epoch).toBe(env.UVANOO_WOPI_RECOVERY_EPOCH)
    expect(() => recoveryConfig({ ...env, BETTER_AUTH_URL: 'https://legacy.uvanoo.com' })).toThrow()
    expect(() => recoveryConfig({ ...env, UVANOO_RECOVERY_COMPOSE_ID: 'legacy' })).toThrow()
  })
})

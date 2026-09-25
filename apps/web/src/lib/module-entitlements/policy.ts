import { getModuleDefinition, isModuleKey, type ModuleKey } from './catalogue'

/** The error surfaced by a server action or route when a licensed module is off. */
export class ModuleNotEntitledError extends Error {
  readonly code = 'MODULE_NOT_ENTITLED'

  constructor(readonly moduleKey: ModuleKey) {
    super(`${getModuleDefinition(moduleKey).name} is not enabled for this tenant.`)
    this.name = 'ModuleNotEntitledError'
  }
}

/** Reject unrecognised strings before they can become entitlement records. */
export function assertModuleKey(value: string): asserts value is ModuleKey {
  if (!isModuleKey(value)) throw new Error(`Unknown module entitlement key: ${value}`)
}

/**
 * Normalizes database results at the authorization boundary. Unknown stored
 * values are ignored rather than granting access to a route introduced later.
 */
export function effectiveModuleKeys(values: readonly string[]): Set<ModuleKey> {
  return new Set(values.filter(isModuleKey))
}

export function isModuleEntitled(values: readonly string[], moduleKey: ModuleKey): boolean {
  return effectiveModuleKeys(values).has(moduleKey)
}

export function assertModuleEntitled(values: readonly string[], moduleKey: ModuleKey): void {
  if (!isModuleEntitled(values, moduleKey)) throw new ModuleNotEntitledError(moduleKey)
}

type EntitlementWindow = {
  state: 'enabled' | 'disabled'
  effectiveFrom: Date | null
  effectiveUntil: Date | null
}

/**
 * Applies the temporal entitlement rule consistently to storage and future
 * plan/property resolvers. The ending instant is exclusive, so adjacent plans
 * cannot both be effective at the same moment.
 */
export function isEntitlementEffective(row: EntitlementWindow, now: Date): boolean {
  return (
    row.state === 'enabled' &&
    (row.effectiveFrom === null || row.effectiveFrom <= now) &&
    (row.effectiveUntil === null || row.effectiveUntil > now)
  )
}

export type EntitlementChange = {
  moduleKey: ModuleKey
  state: 'enabled' | 'disabled'
  effectiveFrom: Date | null
  effectiveUntil: Date | null
}

export function normalizeEntitlementChange(input: {
  moduleKey: string
  state: string
  effectiveFrom?: Date | null
  effectiveUntil?: Date | null
}): EntitlementChange {
  assertModuleKey(input.moduleKey)
  if (input.state !== 'enabled' && input.state !== 'disabled') {
    throw new Error('Entitlement state must be enabled or disabled.')
  }
  if (input.effectiveFrom && input.effectiveUntil && input.effectiveUntil <= input.effectiveFrom) {
    throw new Error('The entitlement end must be after its start.')
  }
  return {
    moduleKey: input.moduleKey,
    state: input.state,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveUntil: input.effectiveUntil ?? null,
  }
}

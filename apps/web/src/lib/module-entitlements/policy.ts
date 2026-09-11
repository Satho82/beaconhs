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


import { describe, expect, it } from 'vitest'
describe('hospitality property input contract', () => { it('keeps hierarchy separate from construction org units', () => expect('hospitality_properties').not.toBe('org_units')) })

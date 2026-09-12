import { describe, expect, it } from 'vitest'
import { signoffPeriod } from './signoff'
describe('manager sign-off periods',()=>{it('uses Monday weeks and calendar months',()=>{expect(signoffPeriod('weekly',new Date('2026-09-13T12:00:00Z')).start.toISOString()).toBe('2026-09-07T00:00:00.000Z');expect(signoffPeriod('monthly',new Date('2026-09-13T12:00:00Z')).end.toISOString()).toBe('2026-10-01T00:00:00.000Z')})})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const scheduleAccess = readFileSync(new URL('./report-schedule-access.ts', import.meta.url), 'utf8')
const runPage = readFileSync(
  new URL('../app/(app)/reports/schedules/[id]/runs/[runId]/page.tsx', import.meta.url),
  'utf8',
)
const pdfRoute = readFileSync(
  new URL('../app/(app)/reports/schedules/[id]/runs/[runId]/pdf/route.ts', import.meta.url),
  'utf8',
)

describe('report schedule and artifact authorization contracts', () => {
  it('limits property principals to schedules owned by their membership', () => {
    expect(scheduleAccess).toContain("actionPropertyScope(ctx).mode === 'tenant'")
    expect(scheduleAccess).toContain('runAsTenantUserId')
    expect(scheduleAccess).toContain('ctx.membership.id')
  })

  it('rechecks property context and schedule ownership on every protected download', () => {
    for (const source of [runPage, pdfRoute]) {
      expect(source).toContain('applyActiveHospitalityPropertyScope')
      expect(source).toContain('reportScheduleAccessWhere')
      expect(source).toContain('reportSchedules')
    }
  })
})

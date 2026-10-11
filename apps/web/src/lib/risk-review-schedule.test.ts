import { describe, expect, it } from 'vitest'
import { filterRiskReviewSchedule, reviewScheduleMetrics } from './risk-review-schedule'

const today = new Date('2026-10-10T12:00:00.000Z')
const rows = [
  { nextReviewDate: '2026-10-09', lastReviewedAt: null },
  { nextReviewDate: '2026-11-09', lastReviewedAt: null },
  { nextReviewDate: '2026-11-10', lastReviewedAt: null },
  { nextReviewDate: '2027-01-08', lastReviewedAt: new Date('2026-10-01T00:00:00Z') },
  { nextReviewDate: null, lastReviewedAt: new Date('2026-08-01T00:00:00Z') },
]

describe('risk review schedule', () => {
  it('counts the approved review windows and recent reviews using UTC calendar dates', () => {
    expect(reviewScheduleMetrics(rows, today)).toEqual({
      overdue: 1,
      dueIn30Days: 1,
      dueIn31To90Days: 2,
      recentlyReviewed: 1,
    })
  })

  it('filters by reference, title, property, category, status and review date', () => {
    const items = [
      {
        assessmentId: '1',
        reference: 'RA-001',
        title: 'Kitchen fire controls',
        propertyId: 'hotel-a',
        propertyName: 'Hotel A',
        category: 'catering',
        status: 'overdue',
        nextReviewDate: '2026-10-09',
        lastReviewedAt: null,
      },
      {
        assessmentId: '2',
        reference: 'RA-002',
        title: 'Guest room slips',
        propertyId: 'hotel-b',
        propertyName: 'Hotel B',
        category: 'housekeeping',
        status: 'active',
        nextReviewDate: '2026-11-09',
        lastReviewedAt: null,
      },
    ]
    expect(filterRiskReviewSchedule(items, { q: 'ra-001' })).toEqual([items[0]])
    expect(filterRiskReviewSchedule(items, { property: 'hotel-b' })).toEqual([items[1]])
    expect(filterRiskReviewSchedule(items, { category: 'catering', status: 'overdue' })).toEqual([
      items[0],
    ])
    expect(filterRiskReviewSchedule(items, { date: 'overdue' })).toEqual([items[0]])
  })

  it('ignores malformed and missing review dates rather than classifying them as overdue', () => {
    expect(
      reviewScheduleMetrics([{ nextReviewDate: 'not-a-date', lastReviewedAt: null }], today),
    ).toEqual({
      overdue: 0,
      dueIn30Days: 0,
      dueIn31To90Days: 0,
      recentlyReviewed: 0,
    })
  })
})

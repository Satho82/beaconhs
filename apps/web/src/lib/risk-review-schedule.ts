export type RiskReviewScheduleItem = {
  assessmentId: string
  reference: string
  title: string
  propertyId: string
  propertyName: string
  category: string
  status: string
  nextReviewDate: string | null
  lastReviewedAt: Date | null
  searchText?: string
}

export type RiskReviewScheduleFilter = {
  q?: string
  property?: string
  category?: string
  status?: string
  date?: string
}

export function reviewScheduleMetrics<
  T extends { nextReviewDate: string | null; lastReviewedAt: Date | null },
>(rows: readonly T[], now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const startOfDay = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value
      ? null
      : parsed
  }
  const daysUntil = (value: string | null) => {
    if (!value) return null
    const date = startOfDay(value)
    return date ? Math.round((date.valueOf() - today.valueOf()) / 86_400_000) : null
  }
  const recentlyReviewedSince = today.valueOf() - 30 * 86_400_000
  return {
    overdue: rows.filter((row) => {
      const days = daysUntil(row.nextReviewDate)
      return days !== null && days < 0
    }).length,
    dueIn30Days: rows.filter((row) => {
      const days = daysUntil(row.nextReviewDate)
      return days !== null && days >= 0 && days <= 30
    }).length,
    dueIn31To90Days: rows.filter((row) => {
      const days = daysUntil(row.nextReviewDate)
      return days !== null && days >= 31 && days <= 90
    }).length,
    recentlyReviewed: rows.filter(
      (row) =>
        row.lastReviewedAt !== null &&
        row.lastReviewedAt.valueOf() >= recentlyReviewedSince &&
        row.lastReviewedAt.valueOf() <= now.valueOf(),
    ).length,
  }
}

export function filterRiskReviewSchedule<T extends RiskReviewScheduleItem>(
  rows: readonly T[],
  filter: RiskReviewScheduleFilter,
) {
  const query = filter.q?.trim().toLowerCase() ?? ''
  return rows.filter((row) => {
    const search = `${row.reference} ${row.title} ${row.searchText ?? ''}`.toLowerCase()
    if (query && !search.includes(query)) return false
    if (filter.property && filter.property !== 'all' && row.propertyId !== filter.property)
      return false
    if (filter.category && filter.category !== 'all' && row.category !== filter.category)
      return false
    if (filter.status && filter.status !== 'all' && row.status !== filter.status) return false
    if (filter.date && filter.date !== 'all') {
      if (filter.date === 'recent') return reviewScheduleMetrics([row]).recentlyReviewed === 1
      const due = row.nextReviewDate
      if (!due) return false
      if (filter.date === 'overdue' && !(due < new Date().toISOString().slice(0, 10))) return false
      if (filter.date === 'next-30') {
        const metrics = reviewScheduleMetrics([row])
        if (metrics.dueIn30Days !== 1) return false
      }
      if (filter.date === 'next-90') {
        const metrics = reviewScheduleMetrics([row])
        if (metrics.dueIn30Days + metrics.dueIn31To90Days !== 1) return false
      }
      if (filter.date === '31-90' && reviewScheduleMetrics([row]).dueIn31To90Days !== 1)
        return false
    }
    return true
  })
}

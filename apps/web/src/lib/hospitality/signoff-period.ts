export type SignoffKind = 'weekly' | 'monthly'
export function signoffPeriod(kind: SignoffKind, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (kind === 'weekly') {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 7)
    return { start, end }
  }
  start.setUTCDate(1)
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  return { start, end }
}

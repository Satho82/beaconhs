export type DiaryRecurrence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export type DiaryTemplateInput = {
  title: string
  instructions?: string
  recurrence: DiaryRecurrence
  dueTime: string
  weekday?: string
  monthDay?: string
  annualMonth?: string
  timezone: string
  assigneeId?: string
}

export function diaryRecurrenceCron(
  input: Pick<
    DiaryTemplateInput,
    'recurrence' | 'dueTime' | 'weekday' | 'monthDay' | 'annualMonth'
  >,
): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)) throw new Error('Due time must use HH:MM.')
  const [hour, minute] = input.dueTime.split(':').map(Number)
  if (input.recurrence === 'daily') return `${minute} ${hour} * * *`
  if (input.recurrence === 'weekly') {
    const weekday = Number(input.weekday)
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
      throw new Error('Weekly recurrence requires a valid weekday.')
    return `${minute} ${hour} * * ${weekday}`
  }
  if (!['monthly', 'quarterly', 'yearly'].includes(input.recurrence))
    throw new Error('Invalid diary recurrence.')
  const monthDay = Number(input.monthDay)
  if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 28)
    throw new Error('Monthly recurrence requires a day between 1 and 28.')
  if (input.recurrence === 'quarterly') return `${minute} ${hour} ${monthDay} 1,4,7,10 *`
  if (input.recurrence === 'yearly') {
    const annualMonth = Number(input.annualMonth)
    if (!Number.isInteger(annualMonth) || annualMonth < 1 || annualMonth > 12)
      throw new Error('Yearly recurrence requires a month between 1 and 12.')
    return `${minute} ${hour} ${monthDay} ${annualMonth} *`
  }
  return `${minute} ${hour} ${monthDay} * *`
}

export function isOperationalTaskOverdue(
  task: { status: string; dueAt: Date },
  now = new Date(),
): boolean {
  return !['completed', 'waived', 'cancelled'].includes(task.status) && task.dueAt < now
}

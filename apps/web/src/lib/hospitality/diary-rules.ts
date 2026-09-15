export type DiaryRecurrence = 'daily' | 'weekly' | 'monthly'
export type DiaryTemplateInput = {
  title: string
  instructions?: string
  recurrence: DiaryRecurrence
  dueTime: string
  weekday?: string
  monthDay?: string
  timezone: string
  assigneeId?: string
}

export function diaryRecurrenceCron(
  input: Pick<DiaryTemplateInput, 'recurrence' | 'dueTime' | 'weekday' | 'monthDay'>,
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
  const monthDay = Number(input.monthDay)
  if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 28)
    throw new Error('Monthly recurrence requires a day between 1 and 28.')
  return `${minute} ${hour} ${monthDay} * *`
}

export function isOperationalTaskOverdue(
  task: { status: string; dueAt: Date },
  now = new Date(),
): boolean {
  return !['completed', 'waived', 'cancelled'].includes(task.status) && task.dueAt < now
}

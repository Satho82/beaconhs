export const INCIDENT_STATUSES = [
  'reported',
  'under_investigation',
  'pending_review',
  'closed',
  'reopened',
] as const

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]

const transitions: Record<IncidentStatus, readonly IncidentStatus[]> = {
  reported: ['under_investigation'],
  under_investigation: ['pending_review'],
  pending_review: ['under_investigation', 'closed'],
  closed: ['reopened'],
  reopened: ['under_investigation'],
}

export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus) {
  return from === to || transitions[from].includes(to)
}

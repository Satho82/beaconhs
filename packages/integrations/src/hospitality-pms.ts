/**
 * Vendor-neutral PMS boundary for hospitality imports. A future Mews adapter
 * implements this contract without leaking Mews payloads into rooms, tasks, or
 * maintenance services.
 */
export type PmsRoomState = 'vacant' | 'occupied' | 'out_of_service' | 'unknown'

export type PmsRoomSnapshot = {
  externalRoomId: string
  roomCode: string
  state: PmsRoomState
  observedAt: Date
  reservationId?: string
  guestDisplayName?: string
}

export type PmsChangeCursor = {
  value: string
  observedAt: Date
}

export type PmsRoomChangePage = {
  rooms: PmsRoomSnapshot[]
  nextCursor: PmsChangeCursor | null
}

export interface HospitalityPmsConnector {
  readonly provider: string
  pullRoomChanges(cursor: PmsChangeCursor | null): Promise<PmsRoomChangePage>
}

const stateAliases: Record<string, PmsRoomState> = {
  vacant: 'vacant',
  inspected: 'vacant',
  clean: 'vacant',
  occupied: 'occupied',
  dirty: 'occupied',
  out_of_service: 'out_of_service',
  outofservice: 'out_of_service',
  maintenance: 'out_of_service',
}

export function normalizePmsRoomState(value: unknown): PmsRoomState {
  if (typeof value !== 'string') return 'unknown'
  return stateAliases[value.trim().toLowerCase().replaceAll(/[- ]/g, '_')] ?? 'unknown'
}

export function pmsRoomIdentity(provider: string, externalRoomId: string): string {
  const cleanProvider = provider.trim().toLowerCase()
  const cleanId = externalRoomId.trim()
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(cleanProvider))
    throw new Error('PMS provider key is invalid.')
  if (!cleanId || cleanId.length > 200 || /[\u0000-\u001f\u007f]/.test(cleanId))
    throw new Error('External PMS room id is invalid.')
  return `${cleanProvider}:${cleanId}`
}

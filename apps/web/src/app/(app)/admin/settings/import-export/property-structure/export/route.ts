import { requireRequestContext } from '@/lib/auth'
import { csvResponse } from '@/lib/csv'
import { exportPropertyStructure } from '@/lib/imports/property-structure-execution'
export async function GET() { const ctx = await requireRequestContext(); const rows = await exportPropertyStructure(ctx); return csvResponse({ filename: 'property-structure.csv', headers: ['Property code','Property name','Timezone','Building code','Floor code','Room code','Room name','Room type'], rows: rows.map((r) => [r.propertyCode,r.propertyName,r.timezone,r.buildingCode,r.floorCode,r.roomCode,r.roomName,r.roomType]) }) }

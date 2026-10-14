import { getReadOnlyPlatformOperator } from '@beaconhs/auth'
import { recoveryConfig } from '@/lib/wopi-save-state'
import { saveStatus } from '@/lib/wopi-save-telemetry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' }

export async function GET(request: Request): Promise<Response> {
  try {
    if (!recoveryConfig()) return new Response(null, { status: 404, headers })
    const operator = await getReadOnlyPlatformOperator(request.headers)
    const approved = (process.env.UVANOO_RECOVERY_READERS ?? '').split(',').filter(Boolean)
    if (!operator || !approved.includes(operator)) {
      return new Response(null, { status: 403, headers })
    }
    return Response.json(await saveStatus(), { headers })
  } catch {
    // No database details, identifiers, credentials or partial zero counters.
    return Response.json({ status: 'UNKNOWN' }, { status: 503, headers })
  }
}

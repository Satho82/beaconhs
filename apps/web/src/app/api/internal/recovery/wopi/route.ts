import { isWopiObserver } from '@/lib/wopi-observer-auth'
import { recoveryConfig } from '@/lib/wopi-save-state'
import { saveStatus } from '@/lib/wopi-save-telemetry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store, private', Vary: 'Authorization' }

export async function GET(request: Request): Promise<Response> {
  try {
    if (!recoveryConfig()) return new Response(null, { status: 404, headers })
    if (!isWopiObserver(request.headers)) {
      return new Response(null, { status: 403, headers })
    }
    return Response.json(await saveStatus(), { headers })
  } catch {
    return Response.json({ status: 'UNKNOWN' }, { status: 503, headers })
  }
}

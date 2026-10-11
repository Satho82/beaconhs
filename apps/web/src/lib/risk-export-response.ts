import { ForbiddenError, ImpersonationBlockedError } from '@beaconhs/tenant'

/** Translate only explicit access denials; preserve redirects and unexpected failures. */
export async function riskExportResponse(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof ImpersonationBlockedError) {
      return Response.json(
        { error: 'Forbidden' },
        {
          status: 403,
          headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        },
      )
    }
    throw error
  }
}

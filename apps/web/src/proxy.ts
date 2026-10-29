import { NextRequest, NextResponse } from 'next/server'
import { bootstrapRequestAllowed } from '@/lib/dev-telemetry-bootstrap'
import { contentSecurityPolicy } from '@/lib/security-headers'

export function proxy(request: NextRequest) {
  if (!bootstrapRequestAllowed(request.method, request.nextUrl.pathname))
    return new NextResponse('DEV maintenance', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const policy = contentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === 'development',
    collaboraUrl: process.env.COLLABORA_URL,
    storageEndpoint: process.env.R2_ENDPOINT,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
  })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', policy)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', policy)
  return response
}

export const config = { matcher: '/:path*' }

import { NextRequest, NextResponse } from 'next/server'
import { contentSecurityPolicy } from '@/lib/security-headers'

export function proxy(request: NextRequest) {
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
  // Platform routes must be rendered outside the tenant workspace shell. This
  // header is created only at the server request boundary, never trusted from
  // client input.
  requestHeaders.set(
    'x-platform-route',
    request.nextUrl.pathname.startsWith('/platform') ? '1' : '0',
  )

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', policy)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}

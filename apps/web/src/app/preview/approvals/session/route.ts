import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from '@beaconhs/auth'
import { assertLocalPreview } from '@/lib/approvals/preview-server'
import { PREVIEW_PEOPLE } from '@/lib/approvals/preview-fixtures'
import { previewSessionRedirect } from '@/lib/approvals/preview-session'
import { ACTIVE_TENANT_COOKIE } from '@/lib/auth'
export async function POST(request: NextRequest) {
  await assertLocalPreview()
  if (request.headers.get('origin') !== 'http://localhost:3103')
    return new NextResponse('Origin denied', { status: 403 })
  const role = (await request.formData()).get('role')
  if (role !== 'requester' && role !== 'manager' && role !== 'finance' && role !== 'configurator')
    return new NextResponse('Unknown review account', { status: 400 })
  const password = process.env.APPROVALS_PREVIEW_PASSWORD
  if (!password) return new NextResponse('Preview launcher required', { status: 503 })
  const signed = await getAuth().api.signInEmail({
    body: { email: PREVIEW_PEOPLE[role].email, password },
    headers: request.headers,
    asResponse: true,
  })
  if (!signed.ok)
    return new NextResponse('Preview authentication failed. Check the local launcher.', {
      status: 503,
    })
  const cookieHeaders = signed.headers.getSetCookie()
  const verified = await getAuth().api.getSession({
    headers: new Headers({
      cookie: cookieHeaders.map((cookie) => cookie.split(';')[0]).join('; '),
    }),
    query: { disableCookieCache: true },
  })
  if (verified?.user.id !== PREVIEW_PEOPLE[role].user)
    return new NextResponse(
      'Preview session could not be verified against the isolated database.',
      { status: 503 },
    )
  return previewSessionRedirect(cookieHeaders, ACTIVE_TENANT_COOKIE)
}

import { PREVIEW_ROOT, PREVIEW_TENANT } from './preview-fixtures'

export function previewSessionRedirect(sessionCookies: string[], tenantCookieName: string) {
  const headers = new Headers({ location: `http://localhost:3103${PREVIEW_ROOT}` })
  for (const cookie of sessionCookies) headers.append('set-cookie', cookie)
  headers.append(
    'set-cookie',
    `${tenantCookieName}=${PREVIEW_TENANT}; Path=/; HttpOnly; SameSite=Lax`,
  )
  // Keep the signed cookies byte-for-byte. Mixing raw Set-Cookie appends with
  // NextResponse.cookies.set() can replace the appended authentication cookies.
  return new Response(null, { status: 303, headers })
}

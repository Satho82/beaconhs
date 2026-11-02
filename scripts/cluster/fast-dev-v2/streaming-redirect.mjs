// Next can send an authentication redirect after streaming HTTP headers. Accept
// only its exact same-origin login redirect, never arbitrary HTTP 200 pages.
export function isStreamingLoginRedirect(body) {
  return (
    body.includes(
      '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/login"/>',
    ) && body.includes('NEXT_REDIRECT;replace;/login;307;')
  )
}
export async function readinessFetch(url, options) {
  const response = await fetch(url, options)
  const parsed = new URL(url)
  if (
    parsed.origin !== 'https://dev.uvanoo.com' ||
    parsed.pathname === '/login' ||
    response.status !== 200
  )
    return response
  const body = await response.clone().text()
  if (!isStreamingLoginRedirect(body)) return response
  await response.body?.cancel()
  return new Response(null, { status: 307, headers: { location: '/login' } })
}

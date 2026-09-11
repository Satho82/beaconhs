export function GET(request: Request): Response {
  return Response.redirect(new URL('/icon.png', request.url), 308)
}

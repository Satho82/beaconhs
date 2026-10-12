import { isUuid } from '@/lib/list-params'
import { isRouterPrefetch } from '@/lib/router-prefetch'
import { requireRequestContext } from '@/lib/auth'
import { downloadApprovalDocument } from '@/lib/approvals/production'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  if (isRouterPrefetch(request)) return new Response(null, { status: 204 })
  const { id, documentId } = await params
  if (!isUuid(id) || !isUuid(documentId))
    return new Response('Document unavailable', { status: 404 })
  const ctx = await requireRequestContext()
  try {
    const d = await downloadApprovalDocument(ctx, id, documentId)
    return new Response(new Uint8Array(d.bytes), {
      headers: {
        'Content-Type': d.contentType,
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(d.filename),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch {
    return new Response('Document unavailable', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}

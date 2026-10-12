import { NextRequest, NextResponse } from 'next/server'
import { requireRequestContext } from '@/lib/auth'
import {
  attachApprovalDocument,
  approvalActivity,
  configureProductionWorkflow,
  createFinancialRequest,
  productionDecision,
} from '@/lib/approvals/production'

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const allowed = new URL(process.env.PUBLIC_APP_URL ?? process.env.APP_URL ?? request.url).origin
  if (origin !== allowed || request.headers.get('sec-fetch-site') === 'cross-site')
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  const ctx = await requireRequestContext()
  const limit = 10 * 1024 * 1024 + 64 * 1024
  if (Number(request.headers.get('content-length') ?? 0) > limit)
    return NextResponse.json({ error: 'Document must be at most 10 MB' }, { status: 413 })
  const reader = request.body?.getReader()
  if (!reader) return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > limit) {
      await reader.cancel()
      return NextResponse.json({ error: 'Document must be at most 10 MB' }, { status: 413 })
    }
    chunks.push(part.value)
  }
  try {
    const bytes = Buffer.concat(chunks)
    const body = await new Response(bytes, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData()
    const action = String(body.get('action') ?? '')
    const input = JSON.parse(String(body.get('input') ?? '{}')) as unknown
    let result: { id: string }
    if (action === 'create' || action === 'attach') {
      const file = body.get('document')
      if (!(file instanceof File))
        return NextResponse.json(
          { error: 'A PDF, JPG or PNG document is required' },
          { status: 400 },
        )
      result = await (action === 'create' ? createFinancialRequest : attachApprovalDocument)(
        ctx,
        input,
        { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
      )
    } else if (action === 'configure') result = await configureProductionWorkflow(ctx, input)
    else if (action === 'decision') result = await productionDecision(ctx, input)
    else if (action === 'activity') result = await approvalActivity(ctx, input)
    else return NextResponse.json({ error: 'Unknown approval action' }, { status: 400 })
    return NextResponse.json({ id: result.id }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json(
      {
        error:
          'The request could not be saved. Check the fields, workflow limits and your current authority, then refresh before retrying.',
      },
      { status: 400 },
    )
  }
}

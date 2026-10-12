import { isRouterPrefetch } from '@/lib/router-prefetch'
import { requireExportContext } from '@/lib/auth'
import { productionList } from '@/lib/approvals/production'
import { recordAudit } from '@/lib/audit'
import { csvResponse, CSV_EXPORT_MAX_ROWS, CSV_EXPORT_QUERY_LIMIT } from '@/lib/csv'
export async function GET(request: Request) {
  if (isRouterPrefetch(request)) return new Response(null, { status: 204 })
  const ctx = await requireExportContext(),
    sp = new URL(request.url).searchParams
  try {
    const rows = await ctx.db(async (tx) => {
      const data = await productionList(
        { ...ctx, db: async (fn) => fn(tx) },
        {
          view: 'reports',
          q: (sp.get('q') ?? '').slice(0, 200),
          status: sp.get('status') ?? '',
          propertyId: sp.get('property') ?? '',
          page: 1,
          perPage: CSV_EXPORT_QUERY_LIMIT,
        },
      )
      if (data.total > CSV_EXPORT_MAX_ROWS)
        throw new Error('Narrow the report to 10000 requests or fewer')
      await recordAudit(
        { ...ctx, db: async (fn) => fn(tx) },
        {
          entityType: 'approval_report',
          entityId: ctx.tenantId,
          action: 'export',
          summary: 'Approvals report exported',
          metadata: { count: data.total },
        },
      )
      return data.rows
    })
    const keys = [
      'id',
      'title',
      'property_name',
      'category',
      'amount',
      'currency',
      'supplier',
      'status',
      'created_at',
    ]
    const response = csvResponse({
      filename: 'approvals.csv',
      headers: keys,
      rows: rows.map((r) =>
        keys.map((k) => {
          const value = r[k] instanceof Date ? r[k].toISOString() : String(r[k] ?? '')
          return /^\s+[=+@-]/.test(value) ? "'" + value : value
        }),
      ),
    })
    response.headers.set('X-Content-Type-Options', 'nosniff')
    return response
  } catch {
    return new Response(
      'Export unavailable. Check your export authority or narrow the report to 10,000 requests or fewer.',
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}

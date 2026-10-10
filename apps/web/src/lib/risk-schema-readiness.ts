import { sql } from 'drizzle-orm'
import type { RequestContext } from '@beaconhs/tenant'

/** One read-only catalogue query: never infer readiness from an app flag or ORM types. */
export async function isRiskSchemaReady(ctx: Pick<RequestContext, 'db'>): Promise<boolean> {
  return ctx.db(async (tx) => {
    const result = await tx.execute(sql`
      select (
        to_regclass('public.risk_template_families') is not null
        and to_regclass('public.risk_assessment_versions') is not null
        and exists (
          select 1 from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          where t.typname = 'risk_template_state'
            and t.typnamespace = 'public'::regnamespace
            and e.enumlabel = 'draft'
        )
        and exists (
          select 1 from pg_attribute
          where attrelid = to_regclass('public.risk_templates')
            and attname = 'template_family_id' and attnum > 0 and not attisdropped
        )
        and exists (
          select 1 from pg_attribute
          where attrelid = to_regclass('public.risk_assessments')
            and attname = 'content_revision' and attnum > 0 and not attisdropped
        )
        and exists (
          select 1 from pg_attribute
          where attrelid = to_regclass('public.risk_hazards')
            and attname = 'archived_at' and attnum > 0 and not attisdropped
        )
      ) as ready
    `)
    const raw = result as unknown
    const rows =
      (raw as { rows?: Array<{ ready: boolean }> }).rows ?? (raw as Array<{ ready: boolean }>)
    return rows[0]?.ready === true
  })
}

export async function requireRiskSchemaReady(ctx: Pick<RequestContext, 'db'>): Promise<void> {
  if (!(await isRiskSchemaReady(ctx))) {
    throw new Error('Risk Assessments are unavailable until the approved database upgrade')
  }
}

export function riskSchemaUnavailableResponse(): Response {
  return Response.json(
    { error: 'Risk Assessments are temporarily unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  )
}

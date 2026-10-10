import Link from 'next/link'
import { Badge, Button, EmptyState, PageHeader, Select } from '@beaconhs/ui'
import {
  RISK_CATALOGUE_CATEGORIES,
  RISK_CATALOGUE_TEMPLATES,
  riskCatalogueMetadata,
} from '@beaconhs/db'
import { can, type RequestContext } from '@beaconhs/tenant'
import { PageContainer } from '@/components/page-layout'
import { Pagination } from '@/components/pagination'
import { listRiskTemplates } from '@/lib/risk-assessments'
import {
  filterRiskTemplates,
  riskPage,
  riskTemplateCategory,
  type RiskSearch,
} from '@/lib/risk-library-views'
import { pickString } from '@/lib/list-params'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { RiskViewTabs } from './risk-view-tabs'

export async function AvailableTemplates({
  ctx,
  search,
}: {
  ctx: RequestContext
  search: RiskSearch
}) {
  const translateValue = await getGeneratedValueTranslations()
  const templates = await listRiskTemplates(ctx)
  const matches = filterRiskTemplates(templates, search)
  const page = riskPage(matches, search)
  const installed = templates.filter((template) => riskCatalogueMetadata(template)).length
  const property = pickString(search.property)
  const canAdopt = can(ctx, 'hospitality.manage')
  return (
    <PageContainer>
      <PageHeader
        title={translateValue('Risk Assessments')}
        description={translateValue(
          'Reusable Uvanoo and tenant templates for competent, property-specific assessment.',
        )}
      />
      <RiskViewTabs search={search} view="templates" />
      <section className="mt-6 space-y-4">
        <h2 className="text-xl font-semibold">{translateValue('Available Templates')}</h2>
        <p className="text-muted-foreground text-sm">
          {installed} {translateValue('of')} {RISK_CATALOGUE_TEMPLATES.length}{' '}
          {translateValue(
            'approved catalogue topics installed. Templates are starting points; adoption creates an editable draft and does not approve an assessment.',
          )}
        </p>
        {installed < RISK_CATALOGUE_TEMPLATES.length && (
          <p role="status" className="rounded-lg border p-3 text-sm">
            {translateValue(
              'Some approved catalogue topics are not installed in this environment. Only saved templates can be previewed and adopted.',
            )}
          </p>
        )}
        <form method="get" className="flex flex-wrap gap-3 rounded-lg border p-4">
          <input type="hidden" name="view" value="templates" />
          {property && <input type="hidden" name="property" value={property} />}
          <input
            name="q"
            defaultValue={pickString(search.q)}
            aria-label={translateValue('Search templates')}
            placeholder={translateValue('Search reference, title or keyword')}
            className="bg-background min-w-64 flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <Select
            name="catalogueCategory"
            defaultValue={pickString(search.catalogueCategory) ?? ''}
            aria-label={translateValue('Template category')}
          >
            <option value="">All categories</option>
            {RISK_CATALOGUE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
          <Select
            name="owner"
            defaultValue={pickString(search.owner) ?? ''}
            aria-label={translateValue('Template owner')}
          >
            <option value="">All owners</option>
            <option value="platform">Uvanoo master templates</option>
            <option value="tenant">Tenant templates</option>
          </Select>
          <Select
            name="perPage"
            defaultValue={page.perPage}
            aria-label={translateValue('Templates per page')}
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </Select>
          <Button type="submit">{translateValue('Filter templates')}</Button>
        </form>
        {page.rows.length === 0 ? (
          <EmptyState title={translateValue('No risk templates found')} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {page.rows.map((template) => {
              const metadata = riskCatalogueMetadata(template)
              const href = `/hospitality/risk/templates/${template.id}${property ? `?property=${encodeURIComponent(property)}` : ''}`
              return (
                <article key={template.id} className="rounded-lg border p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground text-sm">
                      {metadata?.reference ?? translateValue('Custom / existing template')}
                    </span>
                    <Badge variant="outline">
                      {template.scope === 'platform'
                        ? translateValue('Uvanoo master')
                        : translateValue('Tenant template')}
                    </Badge>
                  </div>
                  <h3 className="mt-2 font-semibold">{template.title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {riskTemplateCategory(template)}
                  </p>
                  <p className="mt-2 text-sm">{metadata?.scope ?? template.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {metadata?.applicability.map((label) => (
                      <Badge key={label} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-muted-foreground mt-3 text-xs">
                    {translateValue('Version')} {metadata?.version ?? template.version} ·{' '}
                    {template.state} ·{' '}
                    {metadata?.contentStatus ?? translateValue('Property-specific review required')}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                      <Link href={href}>{translateValue('Preview')}</Link>
                    </Button>
                    {canAdopt && template.state === 'active' && (
                      <>
                        <Button asChild>
                          <Link href={`${href}#template-adoption`}>{translateValue('Adopt')}</Link>
                        </Button>
                        <Button asChild variant="outline">
                          <Link href={`${href}#template-amend`}>
                            {translateValue('Adopt & Amend')}
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
        <Pagination
          basePath="/hospitality/risk"
          currentParams={{ ...search, view: 'templates' }}
          total={page.total}
          page={page.page}
          perPage={page.perPage}
        />
      </section>
    </PageContainer>
  )
}

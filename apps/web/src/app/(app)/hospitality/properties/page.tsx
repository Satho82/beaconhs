import { PageContainer } from '@/components/page-layout'
import { SearchInput } from '@/components/search-input'
import { Pagination } from '@/components/pagination'
import { can } from '@beaconhs/tenant'
import { getGeneratedTranslations, getGeneratedValueTranslations } from '@/i18n/generated.server'
import Link from 'next/link'
import { Button, EmptyState, PageHeader } from '@beaconhs/ui'
import { requireRequestContext } from '@/lib/auth'
import { listProperties } from '@/lib/hospitality/properties'
import { loadEnabledModuleKeys } from '@/lib/module-entitlements/server'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'

/** Additive Uvanoo module; the existing tenant dashboard remains unchanged. */
export default async function HospitalityPropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [translateHospitality, translateValue] = await Promise.all([
    getGeneratedTranslations(),
    getGeneratedValueTranslations(),
  ])

  const ctx = await requireRequestContext()
  const search = await searchParams
  const propertyContext = await resolveHospitalityPropertyContext(ctx)
  const { properties, total, params } = await listProperties(
    ctx,
    search,
    propertyContext.activePropertyId,
  )
  const modules = await loadEnabledModuleKeys(ctx)
  return (
    <PageContainer>
      <PageHeader
        title={translateHospitality('m_008a1e78d9023f')}
        description={translateHospitality('m_06f2e6bfa2a821')}
        actions={
          <div className="flex flex-wrap gap-2">
            {modules.has('hospitality.maintenance') && (
              <Button asChild variant="outline">
                <Link href="/hospitality/maintenance">{translateValue('Maintenance queue')}</Link>
              </Button>
            )}
            {can(ctx, 'hospitality.manage') && (
              <Button asChild>
                <Link href="/hospitality/properties/new">
                  {translateHospitality('m_1768b1fbb37747')}
                </Link>
              </Button>
            )}
          </div>
        }
      />
      <div className="mt-4">
        <SearchInput />
      </div>
      {properties.length === 0 ? (
        <EmptyState
          title={translateHospitality(
            params.q || total > 0 ? 'm_0c726da8b78d42' : 'm_1b475b726a7cfe',
          )}
          description={params.q || total > 0 ? undefined : translateHospitality('m_0cfd202fe1132e')}
        />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {properties.map((property) => (
            <Link
              className="rounded-lg border p-4"
              href={`/hospitality/properties/${property.id}`}
              key={property.id}
            >
              <strong>{property.name}</strong>
              <p className="text-muted-foreground text-sm">
                {property.code} · {property.timezone}
              </p>
            </Link>
          ))}
        </div>
      )}
      <Pagination
        basePath="/hospitality/properties"
        currentParams={search}
        total={total}
        page={params.page}
        perPage={params.perPage}
      />
    </PageContainer>
  )
}

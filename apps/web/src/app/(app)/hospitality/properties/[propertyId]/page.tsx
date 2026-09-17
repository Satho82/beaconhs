import { PageContainer } from '@/components/page-layout'
import { SearchInput } from '@/components/search-input'
import { Pagination } from '@/components/pagination'
import { ConfirmButton } from '@/components/confirm-button'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid, parseListParams } from '@/lib/list-params'
import { and, asc, count, eq, ilike, isNull, or } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button, EmptyState, PageHeader, Input, Label } from '@beaconhs/ui'
import { hospitalityBuildings, hospitalityProperties } from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { assertCanAccessProperty } from '@/lib/hospitality/property-access'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { loadEnabledModuleKeys } from '@/lib/module-entitlements/server'
import { assertCan } from '@beaconhs/tenant'
import { can } from '@beaconhs/tenant'
import { createBuildingAction, archivePropertyAction } from '../actions'
export default async function PropertyDetail({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const translateHospitality = await getGeneratedTranslations()

  const { propertyId: id } = await params
  if (!isUuid(id)) notFound()

  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  assertCan(ctx, 'hospitality.read')
  assertCanAccessProperty(ctx, id)

  const search = await searchParams
  const list = parseListParams(search, { sort: 'name', dir: 'asc', allowedSorts: ['name'] })
  const buildingWhere = and(
    eq(hospitalityBuildings.tenantId, ctx.tenantId),
    eq(hospitalityBuildings.propertyId, id),
    isNull(hospitalityBuildings.deletedAt),
    list.q
      ? or(
          ilike(hospitalityBuildings.name, `%${list.q}%`),
          ilike(hospitalityBuildings.code, `%${list.q}%`),
        )
      : undefined,
  )
  const data = await ctx.db(async (tx) => {
    const [property] = await tx
      .select()
      .from(hospitalityProperties)
      .where(
        and(
          eq(hospitalityProperties.tenantId, ctx.tenantId),
          eq(hospitalityProperties.id, id),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .limit(1)
    const buildings = property
      ? await tx
          .select()
          .from(hospitalityBuildings)
          .where(buildingWhere)
          .orderBy(asc(hospitalityBuildings.name), asc(hospitalityBuildings.id))
          .limit(list.perPage)
          .offset((list.page - 1) * list.perPage)
      : []
    const [total] = property
      ? await tx.select({ value: count() }).from(hospitalityBuildings).where(buildingWhere)
      : []
    return { property, buildings, total: total?.value ?? 0 }
  })
  if (!data.property) notFound()
  const property = data.property
  const translateValue = await getGeneratedValueTranslations()
  const manage = can(ctx, 'hospitality.manage')
  const modules = await loadEnabledModuleKeys(ctx)
  return (
    <PageContainer>
      <PageHeader
        title={property.name}
        description={`${property.code} · ${property.timezone}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {modules.has('hospitality.manager-signoff') && (
              <Button asChild variant="outline">
                <Link href={`/hospitality/properties/${property.id}/signoff`}>
                  {' '}
                  {translateHospitality('m_04e9edeb84cfb2')}{' '}
                </Link>
              </Button>
            )}
            {modules.has('hospitality.diary') && (
              <Button asChild variant="outline">
                <Link href={`/hospitality/properties/${property.id}/diary`}>
                  {translateHospitality('m_02809e95ad534f')}
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/hospitality/properties">{translateHospitality('m_0ff8b0f42104ce')}</Link>
            </Button>
          </div>
        }
      />
      <section className="mt-5">
        <h2 className="text-lg font-semibold">{translateHospitality('m_120c894d671916')}</h2>
        {manage && (
          <form
            action={createBuildingAction}
            className="mt-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-3"
          >
            <input type="hidden" name="propertyId" value={property.id} />
            <Label>
              {' '}
              {translateHospitality('m_02b18d5c7f6f2d')}{' '}
              <Input name="name" required maxLength={200} />
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_0570e24c85cf95')}{' '}
              <Input name="code" required maxLength={80} />
            </Label>
            <Button type="submit">{translateHospitality('m_0697734d149926')}</Button>
          </form>
        )}
        <div className="mt-3">
          <SearchInput />
        </div>
        {data.buildings.length === 0 ? (
          <EmptyState
            title={translateHospitality(
              list.q || data.total > 0 ? 'm_0c726da8b78d42' : 'm_1454923d61098a',
            )}
            description={
              list.q || data.total > 0 ? undefined : translateHospitality('m_01ba1670f68aa6')
            }
          />
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.buildings.map((b) => (
              <Link
                className="rounded-lg border p-4"
                href={`/hospitality/properties/${property.id}/buildings/${b.id}`}
                key={b.id}
              >
                <strong>{b.name}</strong>
                <p className="text-muted-foreground text-sm">{b.code}</p>
              </Link>
            ))}
          </div>
        )}
        <Pagination
          basePath={`/hospitality/properties/${property.id}`}
          currentParams={search}
          total={data.total}
          page={list.page}
          perPage={list.perPage}
        />
      </section>
      {manage && (
        <section className="mt-6 rounded-lg border p-4">
          <h2 className="font-semibold">{translateValue('Property management')}</h2>
          <form action={archivePropertyAction} className="mt-3">
            <input type="hidden" name="id" value={property.id} />
            <ConfirmButton
              name="confirmation"
              value="archive"
              variant="destructive"
              message={translateValue(
                'Archive this property? It will disappear from active lists. Existing records will be retained.',
              )}
            >
              {translateValue('Archive property')}
            </ConfirmButton>
          </form>
        </section>
      )}
    </PageContainer>
  )
}

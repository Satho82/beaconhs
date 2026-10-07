import { PropertyBreadcrumbs } from '@/components/hospitality/property-breadcrumbs'
import { TabNav, pickActiveTab } from '@/components/tab-nav'
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
  const tBoard = await getGeneratedValueTranslations()

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
  const tab = pickActiveTab(
    search,
    manage
      ? (['overview', 'structure', 'operations', 'settings'] as const)
      : (['overview', 'structure', 'operations'] as const),
    'overview',
  )
  return (
    <PageContainer>
      <PropertyBreadcrumbs current={property.name} />
      <PageHeader
        title={property.name}
        description={`${property.code} · ${property.timezone}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/hospitality/properties">{translateHospitality('m_0ff8b0f42104ce')}</Link>
            </Button>
          </div>
        }
      />
      <div className="mt-5">
        <TabNav
          basePath={`/hospitality/properties/${id}`}
          currentParams={search}
          active={tab}
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'structure', label: 'Structure' },
            { key: 'operations', label: 'Operations' },
            { key: 'settings', label: 'Settings', hidden: !manage },
          ]}
        />
      </div>
      {tab === 'overview' && (
        <section className="uv-surface mt-5 p-5">
          <h2 className="text-lg font-semibold">{tBoard('Property overview')}</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              ['Property', property.name],
              ['Code', property.code],
              ['Timezone', property.timezone],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{tBoard(label)}</dt>
                <dd className="mt-1 font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-sm text-slate-600">
            {tBoard(
              'Manage the existing Property → Building → Floor → Room structure. Rooms remain the hospitality accommodation records.',
            )}
          </p>
        </section>
      )}
      {tab === 'operations' && (
        <section className="uv-surface mt-5 p-5">
          <h2 className="text-lg font-semibold">{tBoard('Property operations')}</h2>
          <div className="mt-4 flex flex-wrap gap-3">
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
          </div>
          {!modules.has('hospitality.diary') && !modules.has('hospitality.manager-signoff') && (
            <p className="mt-3 text-sm text-slate-500">
              {tBoard('No property diary or sign-off module is enabled.')}
            </p>
          )}
        </section>
      )}
      {tab === 'structure' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="uv-surface p-4">
            <h2 className="font-semibold">{tBoard('Structure')}</h2>
            <ol className="mt-3 space-y-3 border-l border-teal-700 pl-4 text-sm">
              <li className="font-medium">{property.name}</li>
              <li>{tBoard('Buildings')}</li>
              <li className="text-slate-500">
                {tBoard('Open a building to browse floors, then rooms.')}
              </li>
            </ol>
          </aside>
          <section className="uv-surface min-w-0 p-5">
            <h2 className="text-lg font-semibold">{translateHospitality('m_120c894d671916')}</h2>
            {manage && (
              <form
                action={createBuildingAction}
                className="uv-surface mt-3 grid gap-2 p-4 sm:grid-cols-3"
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
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <SearchInput />
              <span className="text-sm text-slate-500">
                {translateHospitality('m_104249d25c4dfb', { value0: data.total })}
              </span>
              {can(ctx, 'admin.settings.manage') && manage && (
                <Link
                  href="/admin/settings/import-export/property-structure/upload"
                  className="text-sm text-teal-700 underline"
                >
                  {tBoard('Import property structure (tenant-wide)')}
                </Link>
              )}
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
                    className="uv-record-link"
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
        </div>
      )}
      {manage && tab === 'settings' && (
        <section className="uv-surface mt-6 p-5">
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

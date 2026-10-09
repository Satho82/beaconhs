import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import Link from 'next/link'
import { Boxes, Search } from 'lucide-react'
import { PageContainer } from '@/components/page-layout'
import { requirePlatformOperator } from '@/lib/auth'
import { MODULE_CATALOGUE } from '@/lib/module-entitlements/catalogue'
import { parseListParams } from '@/lib/list-params'
import { Pagination } from '@/components/pagination'

export const dynamic = 'force-dynamic'
export default async function PlatformModulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const tVisual = await getGeneratedValueTranslations()

  await requirePlatformOperator()
  const sp = await searchParams
  const params = parseListParams(sp, {
    sort: 'name',
    allowedSorts: ['name'],
    dir: 'asc',
    perPage: 5,
  })
  const q = params.q ?? ''
  const modules = MODULE_CATALOGUE.filter((module) =>
    `${module.name} ${module.description}`.toLowerCase().includes(q.toLowerCase()),
  )
  return (
    <PageContainer>
      <div className="space-y-6">
        <nav aria-label={tVisual('Breadcrumb')} className="text-sm text-blue-600">
          <Link href="/platform">{tVisual('Platform Admin')}</Link> {tVisual('› Modules')}
        </nav>
        <header>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-[#101b55]">
            <Boxes />
            {tVisual('Modules and entitlements')}
          </h1>
          <p className="mt-2 text-sm text-[#546f9c]">
            {tVisual(
              'Manage access using the platform entitlement catalogue. Navigation preferences do not grant module access.',
            )}
          </p>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form role="search" className="flex items-center gap-2 rounded-md border bg-white p-2">
            <Search size={18} />
            <input
              type="search"
              name="q"
              aria-label={tVisual('Search modules')}
              defaultValue={q}
              placeholder={tVisual('Search modules…')}
              className="min-w-0 outline-offset-2"
            />
            <button className="text-sm text-blue-600">{tVisual('Search')}</button>
          </form>
          <Link
            href="/platform/tenants"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {tVisual('Choose tenant to manage entitlements')}
          </Link>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-blue-50 text-[#101b55]">
              <tr>
                <th className="p-4">{tVisual('Module')}</th>
                <th className="p-4">{tVisual('Supported capability')}</th>
                <th className="p-4">{tVisual('Entitlement key')}</th>
              </tr>
            </thead>
            <tbody>
              {modules
                .slice((params.page - 1) * params.perPage, params.page * params.perPage)
                .map((module) => (
                  <tr key={module.key} className="border-t">
                    <td className="p-4 font-medium">{tVisual(module.name)}</td>
                    <td className="p-4">{tVisual(module.description)}</td>
                    <td className="p-4 font-mono text-xs">{module.key}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!modules.length && (
            <p role="status" className="p-5">
              {tVisual('No matching modules.')}
            </p>
          )}
        </div>
        <Pagination
          basePath="/platform/modules"
          currentParams={sp}
          total={modules.length}
          page={params.page}
          perPage={params.perPage}
        />
      </div>
    </PageContainer>
  )
}

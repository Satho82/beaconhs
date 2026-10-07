import Link from 'next/link'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'

/** Navigation uses the same hierarchy already authorised by the containing page. */
export async function PropertyBreadcrumbs({
  propertyId,
  propertyName,
  buildingId,
  buildingName,
  floorId,
  floorName,
  current,
}: {
  propertyId?: string
  propertyName?: string
  buildingId?: string
  buildingName?: string
  floorId?: string
  floorName?: string
  current: string
}) {
  const t = await getGeneratedValueTranslations()
  const propertyPath = `/hospitality/properties/${propertyId}`
  const buildingPath = `${propertyPath}/buildings/${buildingId}`
  const links = [
    { href: '/hospitality/properties', label: t('Properties') },
    ...(propertyId
      ? [{ href: `${propertyPath}?tab=structure`, label: propertyName || t('Property') }]
      : []),
    ...(buildingId ? [{ href: buildingPath, label: buildingName || t('Building') }] : []),
    ...(floorId
      ? [{ href: `${buildingPath}/floors/${floorId}`, label: floorName || t('Floor') }]
      : []),
  ]
  return (
    <nav
      aria-label={t('Property hierarchy')}
      className="mb-5 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
    >
      <ol className="flex flex-wrap items-center gap-2 break-words">
        {links.map((link) => (
          <li key={link.href} className="min-w-0">
            <Link
              href={link.href}
              className="rounded py-1 text-slate-600 hover:text-teal-700 hover:underline focus-visible:outline-2 focus-visible:outline-teal-600 dark:text-slate-300 dark:hover:text-teal-300"
            >
              {link.label}
            </Link>
            <span aria-hidden="true" className="ml-2 text-slate-400">
              /
            </span>
          </li>
        ))}
        <li
          aria-current="page"
          className="min-w-0 font-semibold text-slate-900 dark:text-slate-100"
        >
          {current}
        </li>
      </ol>
    </nav>
  )
}

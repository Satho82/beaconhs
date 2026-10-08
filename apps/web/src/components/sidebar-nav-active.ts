type ActiveNavItem = {
  href: string
  exact?: boolean
  children?: ActiveNavItem[]
}

type ActiveNavGroup = {
  items: ActiveNavItem[]
}

export function findActiveNavHref(
  pathname: string | null | undefined,
  groups: ActiveNavGroup[],
): string | null {
  if (!pathname) return null

  let activeHref: string | null = null

  for (const group of groups) {
    for (const item of flatten(group.items)) {
      if (!matchesNavPath(pathname, item)) continue
      if (!activeHref || item.href.length > activeHref.length) {
        activeHref = item.href
      }
    }
  }

  return activeHref
}

function matchesNavPath(current: string, item: ActiveNavItem): boolean {
  const currentUrl = new URL(current, 'https://navigation.invalid')
  const target = new URL(item.href, 'https://navigation.invalid')
  if (currentUrl.origin !== target.origin) return false
  const pathMatches =
    currentUrl.pathname === target.pathname ||
    (!item.exact &&
      target.pathname !== '/' &&
      currentUrl.pathname.startsWith(target.pathname + '/'))
  if (!pathMatches) return false
  return [...target.searchParams].every(
    ([key, value]) => currentUrl.searchParams.get(key) === value,
  )
}

function flatten(items: ActiveNavItem[]): ActiveNavItem[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])])
}

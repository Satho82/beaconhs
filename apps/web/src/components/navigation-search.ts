import type { SidebarNavGroup, SidebarNavItem } from './sidebar-nav'

/** Search only the already-authorised tree; never reconstruct hidden destinations. */
export function searchNavigation(groups: SidebarNavGroup[], query: string): SidebarNavGroup[] {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return groups
  function match(item: SidebarNavItem): SidebarNavItem | null {
    if (item.label.toLocaleLowerCase().includes(term)) return item
    const children = item.children?.map(match).filter((child) => child !== null)
    return children?.length ? { ...item, children } : null
  }
  return groups
    .map((group) => ({ ...group, items: group.items.map(match).filter((item) => item !== null) }))
    .filter((group) => group.items.length > 0)
}

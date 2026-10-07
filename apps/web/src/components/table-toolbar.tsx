import { GeneratedValue } from '@/i18n/generated'
import { cn } from '@beaconhs/ui'

/**
 * One-row controls strip for list pages: search box + filter dropdowns laid
 * out inline. On desktop everything sits on a single row; on mobile the search
 * box takes the full width and the filter pills wrap beneath it. Pass
 * right-aligned extras (view toggles, secondary actions) via `trailing`.
 *
 *   <TableToolbar trailing={<ViewToggle />}>
 *     <SearchInput placeholder="Search…" />
 *     <FilterChips … />
 *     <FilterChips … />
 *   </TableToolbar>
 */
export function TableToolbar({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-2 rounded-xl bg-slate-100/70 p-2.5 dark:bg-slate-800/50',
        className,
      )}
    >
      <GeneratedValue value={children} />
      <GeneratedValue
        value={
          trailing ? (
            <div className="ml-auto flex items-center gap-2">
              <GeneratedValue value={trailing} />
            </div>
          ) : null
        }
      />
    </div>
  )
}

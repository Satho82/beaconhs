'use client'

// UiLink rather than a bare <a>: back-links are in-app routes, and a plain
// anchor forces a full document reload — which replays the boot splash and
// refetches the whole shell on every record → list hop. The app injects its
// client-side Link via UiLinkProvider (see link-context.tsx).
import { UiBackLink } from './link-context'
import { useUiText } from './text-context'
import { cn } from './utils'

export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  back?: { href: string; label: string }
  className?: string
}) {
  const t = useUiText()
  return (
    <div className={cn('space-y-2', className)}>
      {back ? (
        <UiBackLink
          href={back.href}
          label={t(back.label)}
          className="text-xs text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-300"
        />
      ) : null}
      {/* Keep names and context readable on phones; actions wrap beneath the
          heading until there is room for a side-by-side layout. */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words text-slate-900 lg:text-3xl dark:text-slate-100">
            {t(title)}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t(description)}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex max-w-full flex-wrap items-center gap-2 md:justify-end">
            {actions}
          </div>
        ) : null}
      </header>
    </div>
  )
}

export function DetailHeader({
  back,
  title,
  subtitle,
  badge,
  actions,
}: {
  back?: { href: string; label: string }
  title: string
  subtitle?: string
  badge?: React.ReactNode
  actions?: React.ReactNode
}) {
  const t = useUiText()
  return (
    <header className="space-y-2">
      {back ? (
        <UiBackLink
          href={back.href}
          label={t(back.label)}
          className="text-sm text-teal-700 hover:underline dark:text-teal-300"
        />
      ) : null}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight break-words text-slate-900 lg:text-3xl dark:text-slate-100">
            {t(title)}
          </h1>
          {badge}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {subtitle ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t(subtitle)}</p>
      ) : null}
    </header>
  )
}

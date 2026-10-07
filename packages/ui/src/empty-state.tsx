'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useUiText } from './text-context'
import { cn } from './utils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  const t = useUiText()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
      className={cn(
        'uv-surface flex flex-col items-center justify-center px-5 py-12 text-center sm:px-8 sm:py-16',
        className,
      )}
    >
      {icon ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.22, 0.61, 0.36, 1] }}
          className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgb(var(--color-accent)/0.08)] text-[rgb(var(--color-accent))]"
        >
          <span className="[&_svg]:h-7 [&_svg]:w-7">{icon}</span>
        </motion.div>
      ) : null}
      <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {t(title)}
      </h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {t(description)}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </motion.div>
  )
}

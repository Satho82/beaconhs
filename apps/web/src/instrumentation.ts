import * as Sentry from '@sentry/nextjs'

import { recordPlatformError } from '@/lib/platform-errors'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config')
}

export async function onRequestError(...args: Parameters<typeof Sentry.captureRequestError>) {
  Sentry.captureRequestError(...args)
  await recordPlatformError(args[0])
}

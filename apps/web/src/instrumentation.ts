import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config')
}

export async function onRequestError(...args: Parameters<typeof Sentry.captureRequestError>) {
  Sentry.captureRequestError(...args)

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { recordPlatformError } = await import('./lib/platform-errors')
    await recordPlatformError(args[0], args[1])
  }
}

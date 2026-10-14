import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { parseCookies } from 'better-auth/cookies'
import { constantTimeEqual, makeSignature } from 'better-auth/crypto'
import { db, withSuperAdmin } from '@beaconhs/db'
import { sessions, users } from '@beaconhs/db/schema'
import { getAuth } from './server'

/** Verify the existing Better-Auth signed cookie without getSession's refresh/
 * expired-session deletion side effects. No cached session claims are trusted.
 * Cookie format is Better-Auth 1.6.23 / better-call 1.3.7; unknown formats reject.
 */
export async function verifyReadOnlyCookie(value: string | undefined, secret: string) {
  if (!value || value.length > 4096) return null
  const dot = value.lastIndexOf('.')
  if (dot < 1) return null
  const token = value.slice(0, dot)
  const signature = value.slice(dot + 1)
  if (signature.length !== 44 || !signature.endsWith('=')) return null
  return constantTimeEqual(signature, await makeSignature(token, secret)) ? token : null
}

export async function getReadOnlyPlatformOperator(headers: Headers): Promise<string | null> {
  const context = await getAuth().$context
  const cookies = parseCookies(headers.get('cookie') ?? '')
  const token = await verifyReadOnlyCookie(
    cookies.get(context.authCookies.sessionToken.name),
    context.secret,
  )
  if (!token) return null
  return withSuperAdmin(db, async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`)
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`)
    const [operator] = await tx
      .select({ userId: users.id })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.token, token),
          gt(sessions.expiresAt, sql`clock_timestamp()`),
          isNull(sessions.impersonatingUserId),
          eq(users.isSuperAdmin, true),
          isNull(users.disabledAt),
        ),
      )
      .limit(1)
    return operator?.userId ?? null
  })
}

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { requireValue as check } from './release.mjs'

export function assertAuthoritativeIdentity(data, expectedEmail, readSession) {
  const user = data?.user
  const session = data?.session
  check(
    typeof expectedEmail === 'string' &&
      /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$/.test(expectedEmail) &&
      user?.email === expectedEmail &&
      typeof user?.id === 'string' &&
      typeof session?.id === 'string' &&
      session?.userId === user.id &&
      /^[A-Za-z0-9_-]{1,128}$/.test(user.id) &&
      /^[A-Za-z0-9_-]{1,128}$/.test(session.id),
    'IDENTITY_SESSION_METADATA_REQUIRED',
  )
  check(
    readSession(user.id, session.id, expectedEmail) === 'PASS',
    'IDENTITY_DATABASE_CHECK_FAILED',
  )
}

export function assertVerifierIntegrity(reviewed, installed, entries, pin) {
  check(
    entries.length === 5 &&
      entries.every(
        ({ uid, gid, mode, validType }) =>
          uid === 0 && gid === 0 && (mode & 0o022) === 0 && validType,
      ),
    'VERIFIER_OWNERSHIP_INVALID',
  )
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
  check(digest(reviewed) === digest(installed), 'VERIFIER_SOURCE_MISMATCH')
  check(/^[a-f0-9]{64}$/.test(pin.trim()), 'VERIFIER_MANIFEST_PIN_INVALID')
}

export function readDatabaseSession(userId, sessionId, email) {
  const root = '/opt/uvanoo-fast-v2-browser-v150'
  const helper = `${root}/verify-fixture-session.py`
  const manifest = `${root}/fixture-identities.json`
  const pin = `${root}/fixture-identities.sha256`
  const paths = ['/opt', root, helper, manifest, pin]
  const entries = paths.map((path, index) => {
    const state = lstatSync(path)
    return {
      uid: state.uid,
      gid: state.gid,
      mode: state.mode,
      validType: index < 2 ? state.isDirectory() : state.isFile(),
    }
  })
  assertVerifierIntegrity(
    readFileSync(new URL('./verify-fixture-session.py', import.meta.url)),
    readFileSync(helper),
    entries,
    readFileSync(pin, 'utf8'),
  )
  return execFileSync('/usr/bin/sudo', ['-n', helper, userId, sessionId, email], {
    encoding: 'utf8',
    timeout: 15000,
  }).trim()
}

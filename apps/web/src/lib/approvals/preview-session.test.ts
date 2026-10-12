import { expect, it } from 'vitest'
import { previewSessionRedirect } from './preview-session'

it('preserves every signed auth cookie when adding the tenant selection', () => {
  const cookies = [
    'better-auth.session_token=synthetic%2Bsigned%3D; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax',
    'better-auth.session_data=synthetic-cache; Max-Age=300; Path=/; HttpOnly; SameSite=Lax',
  ]
  const response = previewSessionRedirect(cookies, 'bhs-active-tenant')
  expect(response.status).toBe(303)
  expect(response.headers.get('location')).toBe('http://localhost:3103/preview/approvals')
  expect(response.headers.getSetCookie()).toEqual([
    ...cookies,
    'bhs-active-tenant=a3300000-0000-4000-8000-000000000001; Path=/; HttpOnly; SameSite=Lax',
  ])
})

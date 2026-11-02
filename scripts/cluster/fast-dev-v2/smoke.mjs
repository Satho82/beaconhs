import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { TARGET, requireValue as check } from './release.mjs'
import { submitHandover } from './submit.mjs'

// Reuse the workspace's pinned browser client. No saved interactive admin session.
const require = createRequire(resolve('packages/forms-pdf/package.json'))
const puppeteer = require('puppeteer-core')
let browser
try {
  const sha = process.argv[2]
  check(/^[a-f0-9]{40}$/.test(sha), 'INVALID_SOURCE')
  const {
    DEV_SMOKE_EMAIL: email,
    DEV_SMOKE_PASSWORD: password,
    DEV_SMOKE_PROPERTY_ID: property,
    DEV_SMOKE_FORBIDDEN_PROPERTY_ID: forbidden,
    DEV_SMOKE_BROWSER: executablePath,
  } = process.env
  check(
    email && password && property && forbidden && property !== forbidden && executablePath,
    'SMOKE_FIXTURE_REQUIRED',
  )
  browser = await puppeteer.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(30000)
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === TARGET.origin || ['data:', 'blob:'].includes(url.protocol))
      request.continue()
    else request.abort()
  })
  await page.goto(TARGET.origin + '/login', { waitUntil: 'networkidle2' })
  const signedIn = await page.evaluate(
    async ({ email, password }) => {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      return response.ok
    },
    { email, password },
  )
  check(signedIn, 'SMOKE_LOGIN_FAILED')
  await page.goto(TARGET.origin + '/hospitality/handover', { waitUntil: 'networkidle2' })
  const identity = await page.evaluate(async () => {
    const response = await fetch('/api/auth/get-session')
    const data = await response.json()
    return {
      email: data?.user?.email,
      impersonating: Boolean(data?.session?.impersonatedBy),
      superAdmin: Boolean(data?.user?.isSuperAdmin),
    }
  })
  check(
    identity.email === email && !identity.impersonating && !identity.superAdmin,
    'DEDICATED_TENANT_MEMBER_REQUIRED',
  )
  const properties = await page.$$eval('select[name="propertyId"] option', (options) =>
    options.map((option) => option.value),
  )
  check(
    properties.includes(property) && !properties.includes(forbidden),
    'PROPERTY_SCOPE_SMOKE_FAILED',
  )
  let marker
  if (process.argv.includes('--create')) {
    marker = `DEV automated release smoke ${sha.slice(0, 12)} ${Date.now()}; no operational follow-up required`
    await page.select('select[name="propertyId"]', property)
    await page.type('input[name="department"]', 'Release acceptance')
    await page.type('textarea[name="note"]', marker)
    await submitHandover(page)
  }
  await page.goto(
    TARGET.origin +
      '/hospitality/handover?view=history' +
      (marker ? '&q=' + encodeURIComponent(marker) : ''),
    { waitUntil: 'networkidle2' },
  )
  const result = await page.evaluate(
    (marker) => ({
      history: document.querySelector('h1')?.textContent?.includes('Handover History'),
      created: !marker || document.body.textContent.includes(marker),
    }),
    marker,
  )
  check(result.history && result.created, 'HANDOVER_SMOKE_FAILED')
  console.log(
    JSON.stringify({
      current: 'PASS',
      history: 'PASS',
      propertyScope: 'PASS',
      createdTestRecord: Boolean(marker),
    }),
  )
} catch {
  console.error('AUTHENTICATED_DEV_SMOKE_FAILED')
  process.exitCode = 1
} finally {
  await browser?.close()
}

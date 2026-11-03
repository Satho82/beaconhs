import { requireValue as check } from './release.mjs'

export const MAX_ISOLATION_PAYLOAD_BYTES = 2 * 1024 * 1024

// RSC and HTML can encode ASCII as JSON/JS escapes or character references.
// Decode conservatively without executing page code. Collapsing string syntax
// also detects markers split across adjacent serialized fragments.
export function payloadContainsSentinel(payload, marker) {
  check(
    typeof payload === 'string' &&
      Buffer.byteLength(payload, 'utf8') <= MAX_ISOLATION_PAYLOAD_BYTES,
    'ISOLATION_PAYLOAD_TOO_LARGE',
  )
  let value = payload
  let exhausted = true
  for (let i = 0; i < 8; i++) {
    if (value.includes(marker)) return true
    const next = value
      .replace(/\\+u\{([0-9a-f]{1,6})\}/gi, (_, hex) => {
        const code = parseInt(hex, 16)
        return code <= 127 ? String.fromCharCode(code) : _
      })
      .replace(/\\+u([0-9a-f]{4})/gi, (_, hex) => {
        const code = parseInt(hex, 16)
        return code <= 127 ? String.fromCharCode(code) : _
      })
      .replace(/\\+x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\+([0-7]{1,3})/g, (match, octal) => {
        const code = parseInt(octal, 8)
        return code <= 127 ? String.fromCharCode(code) : match
      })
      .replace(/\\+\r?\n/g, '')
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        const code = parseInt(hex, 16)
        return code <= 127 ? String.fromCharCode(code) : _
      })
      .replace(/&#([0-9]+);/g, (_, decimal) => {
        const code = parseInt(decimal, 10)
        return code <= 127 ? String.fromCharCode(code) : _
      })
      .replace(/&(?:hyphen|dash);/gi, '-')
      .replace(/%([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    if (next === value) {
      exhausted = false
      break
    }
    value = next
  }
  if (value.includes(marker)) return true
  // Nested encodings beyond the bounded decoder are uncertain, never a pass.
  if (
    exhausted &&
    /(?:\\+u(?:[0-9a-f]{4}|\{[0-9a-f]{1,6}\})|\\+x[0-9a-f]{2}|\\+[0-7]{1,3}|&#(?:x[0-9a-f]+|[0-9]+);|&(?:hyphen|dash);|%[0-9a-f]{2})/i.test(
      value,
    )
  ) {
    throw new Error('ISOLATION_PAYLOAD_ENCODING_UNRESOLVED')
  }
  return value.replace(/["'\\,+\[\]{}()\s:]/g, '').includes(marker)
}

async function findSentinel(page, origin, { property, tenant, marker }) {
  check(/^DEV-ISOLATION-SENTINEL-[a-f0-9]{32}$/.test(marker), 'ISOLATION_SENTINEL_INVALID')
  // Search by only a suffix, so the full sentinel cannot appear merely because
  // the server echoed the user-supplied search string into HTML or RSC data.
  const query = marker.slice(-16)
  await page.setCookie(
    { name: 'bhs-active-tenant', value: tenant, url: origin },
    { name: 'active_hospitality_property', value: property, url: origin },
  )
  const response = await page.goto(
    `${origin}/hospitality/handover?view=history&q=${encodeURIComponent(query)}`,
    { waitUntil: 'networkidle2' },
  )
  check(response?.ok(), 'ISOLATION_RESPONSE_INVALID')
  const length = response.headers()['content-length']
  if (length !== undefined) {
    check(
      /^\d+$/.test(length) && Number(length) <= MAX_ISOLATION_PAYLOAD_BYTES,
      'ISOLATION_PAYLOAD_TOO_LARGE',
    )
  }
  const payload = await response.text()
  const serialized = payloadContainsSentinel(payload, marker)
  const observed = await page.evaluate(
    (marker) => ({
      history: document.querySelector('h1')?.textContent?.includes('Handover History'),
      visible: [...document.querySelectorAll('p')].some(
        (item) => item.textContent.trim() === marker,
      ),
      dom: document.documentElement.textContent.includes(marker),
    }),
    marker,
  )
  return { ...observed, serialized }
}

export async function checkPropertyIsolation(page, auditor, origin, cases, allowed) {
  for (const entry of cases) {
    const positive = await findSentinel(auditor, origin, entry)
    check(
      positive.history && positive.visible && positive.serialized,
      'ISOLATION_POSITIVE_CONTROL_FAILED',
    )
    const negative = await findSentinel(page, origin, entry)
    check(
      negative.history && !negative.visible && !negative.dom && !negative.serialized,
      'FORGED_PROPERTY_ISOLATION_FAILED',
    )
  }
  await page.setCookie({ name: 'active_hospitality_property', value: allowed, url: origin })
  await page.goto(origin + '/hospitality/handover', { waitUntil: 'networkidle2' })
}

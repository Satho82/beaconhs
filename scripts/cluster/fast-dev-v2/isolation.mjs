import { requireValue as check } from './release.mjs'

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
  const payload = await response.text()
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
  return { ...observed, serialized: payload.includes(marker) }
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

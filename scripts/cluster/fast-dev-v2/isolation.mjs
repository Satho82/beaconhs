import { requireValue as check } from './release.mjs'

async function findSentinel(page, origin, { property, tenant, marker }) {
  await page.setCookie(
    { name: 'bhs-active-tenant', value: tenant, url: origin },
    { name: 'active_hospitality_property', value: property, url: origin },
  )
  await page.goto(`${origin}/hospitality/handover?view=history&q=${encodeURIComponent(marker)}`, {
    waitUntil: 'networkidle2',
  })
  return page.evaluate(
    (marker) => ({
      history: document.querySelector('h1')?.textContent?.includes('Handover History'),
      found: [...document.querySelectorAll('p')].some((item) => item.textContent.trim() === marker),
    }),
    marker,
  )
}

export async function checkPropertyIsolation(page, auditor, origin, cases, allowed) {
  for (const entry of cases) {
    const positive = await findSentinel(auditor, origin, entry)
    check(positive.history && positive.found, 'ISOLATION_POSITIVE_CONTROL_FAILED')
    const negative = await findSentinel(page, origin, entry)
    check(negative.history && !negative.found, 'FORGED_PROPERTY_ISOLATION_FAILED')
  }
  await page.setCookie({ name: 'active_hospitality_property', value: allowed, url: origin })
  await page.goto(origin + '/hospitality/handover', { waitUntil: 'networkidle2' })
}

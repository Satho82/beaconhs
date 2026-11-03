import { requireValue as check } from './release.mjs'

export async function checkPropertyIsolation(page, origin, cases, allowed) {
  for (const { property, marker } of cases) {
    await page.setCookie({ name: 'active_hospitality_property', value: property, url: origin })
    await page.goto(`${origin}/hospitality/handover?view=history`, {
      waitUntil: 'networkidle2',
    })
    const observed = await page.evaluate(
      (marker) => ({
        history: document.querySelector('h1')?.textContent?.includes('Handover History'),
        // Include hydration scripts: foreign data must not reach the browser at all.
        leaked: document.documentElement.textContent.includes(marker),
      }),
      marker,
    )
    check(observed.history && !observed.leaked, 'FORGED_PROPERTY_ISOLATION_FAILED')
  }
  await page.setCookie({ name: 'active_hospitality_property', value: allowed, url: origin })
  await page.goto(origin + '/hospitality/handover', { waitUntil: 'networkidle2' })
}

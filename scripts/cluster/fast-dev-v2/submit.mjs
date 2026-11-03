import { TARGET, requireValue as check } from './release.mjs'

// Server Actions may revalidate in place without a navigation event.
export async function submitHandover(page) {
  const [response] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.origin === TARGET.origin &&
        url.pathname === '/hospitality/handover' &&
        response.request().method() === 'POST'
      )
    }),
    page.$eval('textarea[name="note"]', (field) => field.form.requestSubmit()),
  ])
  check(response.ok(), 'HANDOVER_SUBMISSION_FAILED')
  // Wait for the streamed action to complete before loading History. Its
  // contents stay in memory and are never logged or included in evidence.
  await response.buffer()
}

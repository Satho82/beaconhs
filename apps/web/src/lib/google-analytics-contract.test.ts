import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const rootLayout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')

describe('platform Google Analytics contract', () => {
  it('loads a configured tag and emits only the default page-view configuration', () => {
    expect(rootLayout).toContain('https://www.googletagmanager.com/gtag/js?id=${googleTagId}')
    expect(rootLayout).toContain("gtag('config',${JSON.stringify(googleTagId)})")
    expect(rootLayout).not.toContain('guestName')
    expect(rootLayout).not.toContain('roomNumber')
    expect(rootLayout).not.toContain('maintenanceToken')
    expect(rootLayout).not.toContain('workOrderId')
  })
})

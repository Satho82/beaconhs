import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = fileURLToPath(new URL('.', import.meta.url))
const page = readFileSync(`${here}page.tsx`, 'utf8')
const form = readFileSync(`${here}settings-form.tsx`, 'utf8')

describe('Tenant Settings General UI contract', () => {
  it('keeps the established server action inside the visual form boundary', () => {
    expect(page).toContain('action={saveSettings}')
    expect(form).toContain('action={action}')
  })

  it('provides functional accessible navigation for every Tenant Settings destination', () => {
    for (const section of [
      'operational-defaults',
      'identity',
      'regulatory-terminology',
      'languages',
    ]) {
      expect(page).toContain(`id=\"${section}\"`)
    }
    expect(form).toContain('aria-label={navigationLabel}')
    for (const tab of ['general', 'branding', 'notifications', 'integrations']) {
      expect(form).toContain(`id: '${tab}'`)
      expect(form).toContain(`label: '${tab}'`)
    }
    expect(form).toContain('icon: LucideIcon')
    for (const href of [
      '/admin/settings',
      '/admin/settings/branding',
      '/admin/notifications',
      '/admin/integrations',
    ]) {
      expect(form).toContain(href)
    }
    expect(form).not.toContain("id: 'advanced'")
    expect(page).not.toContain('name="logoUrl"')
    expect(page).not.toContain('name="primaryColor"')
    expect(form).not.toContain('#additional-controls')
    expect(form).toContain("aria-current={active ? 'page' : undefined}")
  })

  it('keeps the approved tenant settings composition connected to real data and routes', () => {
    for (const key of ['title', 'tenantOverview', 'quickActions', 'aboutTheseSettings']) {
      expect(page).toContain(`t('${key}')`)
    }
    for (const href of [
      '/admin/users/invite',
      '/admin/users',
      '/admin/navigation',
      '/admin/audit',
    ]) {
      expect(page).toContain(`href: '${href}'`)
    }
    expect(page).toContain('hospitalityProperties')
    expect(page).toContain('hospitalityRooms')
    expect(page).toContain('tenantUsers')
    expect(page).toContain('tenantModuleEntitlements')
  })

  it('only enables Save and Discard after a real form edit and resets natively', () => {
    expect(form).toContain('onInput={() => setDirty(true)}')
    expect(form).toContain('disabled={!dirty || pending}')
    expect(form).toContain('formRef.current?.reset()')
  })

  it('uses controlled operational choices with canonical persisted values', () => {
    expect(page).toContain('const CURRENCY_OPTIONS')
    expect(page).toContain("['GBP', 'GBP — £']")
    expect(page).toContain("['AED', 'AED — د.إ']")
    expect(page).toContain('LOCALE_OPTIONS.map')
    expect(page).toContain('const TIMEZONE_OPTIONS')
    for (const timezone of ['Europe/London', 'Europe/Paris', 'America/New_York', 'Asia/Dubai']) {
      expect(page).toContain(`'${timezone}'`)
    }
  })
})

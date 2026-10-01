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

  it('provides accessible section navigation for every General Settings group', () => {
    for (const section of [
      'operational-defaults',
      'identity',
      'regulatory-terminology',
      'people-kiosk',
      'branding',
      'languages',
      'hierarchy',
    ]) {
      expect(page).toContain(`id=\"${section}\"`)
    }
    expect(form).toContain('aria-label={navigationLabel}')
    for (const tab of ['general', 'branding', 'notifications', 'integrations', 'advanced']) {
      expect(form).toContain(`t('${tab}')`)
    }
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
    expect(form).toContain('disabled={!dirty}')
    expect(form).toContain('formRef.current?.reset()')
  })
})

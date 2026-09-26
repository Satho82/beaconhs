import { describe, expect, it } from 'vitest'
import { renderAuthEmail } from './auth-email-branding'

describe('auth email defaults and structured branding', () => {
  it.each([
    ['magic-link', 'Sign in to Uvanoo Portal'],
    ['invite', "You're invited to Hotel in Uvanoo Portal"],
    ['password-reset', 'Reset your Uvanoo Portal password'],
  ] as const)('renders the matching defaults for %s', (kind, subject) => {
    const result = renderAuthEmail({
      kind,
      url: 'https://example.test/auth',
      tenantName: 'Hotel',
      branding: {},
    })
    expect(result.subject).toBe(subject)
    expect(result.html).not.toContain('undefined')
    expect(result.text).toContain('https://example.test/auth')
  })

  it('escapes custom copy and rejects executable authentication URLs', () => {
    const result = renderAuthEmail({
      kind: 'magic-link',
      url: 'https://example.test/auth',
      branding: {
        productName: '<script>bad</script>',
        email: { authEmail: { magicLinkBody: 'Welcome to {{productName}}' } },
      },
    })
    expect(result.html).toContain('&lt;script&gt;bad&lt;/script&gt;')
    expect(result.html).not.toContain('<script>')
    expect(() =>
      renderAuthEmail({ kind: 'magic-link', url: 'javascript:alert(1)', branding: {} }),
    ).toThrow('invalid URL')
  })
})

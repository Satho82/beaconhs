import type { AuthEmailCopy, PlatformBranding } from './platform-branding'

export type AuthEmailKind = 'magic-link' | 'invite' | 'password-reset'

type RenderAuthEmailInput = {
  kind: AuthEmailKind
  url: string
  tenantName?: string
  branding: PlatformBranding
}

type RenderedAuthEmail = { subject: string; html: string; text: string }

const DEFAULT_PRODUCT_NAME = 'Uvanoo Portal'

const defaults: Record<AuthEmailKind, Required<Pick<AuthEmailCopy, 'magicLinkSubject' | 'magicLinkBody' | 'magicLinkCta'>> | Required<Pick<AuthEmailCopy, 'inviteSubject' | 'inviteBody' | 'inviteCta'>> | Required<Pick<AuthEmailCopy, 'passwordResetSubject' | 'passwordResetBody' | 'passwordResetCta'>>> = {
  'magic-link': {
    magicLinkSubject: 'Sign in to {{productName}}',
    magicLinkBody: 'Use the secure link below to sign in to {{productName}}.',
    magicLinkCta: 'Sign in',
  },
  invite: {
    inviteSubject: "You're invited to {{tenantName}} in {{productName}}",
    inviteBody: "You've been invited to join {{tenantName}} in {{productName}}.",
    inviteCta: 'Accept invitation and sign in',
  },
  'password-reset': {
    passwordResetSubject: 'Reset your {{productName}} password',
    passwordResetBody: 'A password reset was requested for your {{productName}} account.',
    passwordResetCta: 'Set a new password',
  },
}

function replaceTokens(value: string, tokens: Record<string, string>): string {
  return value.replace(/{{\s*(productName|tenantName)\s*}}/g, (_, token: string) => tokens[token] ?? '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function asSafeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

function asSafeColor(value: string | undefined): string {
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#1B2B4A'
}

function selectedCopy(kind: AuthEmailKind, copy: AuthEmailCopy | undefined) {
  const fallback = defaults[kind]
  if (kind === 'magic-link') {
    return {
      subject: copy?.magicLinkSubject || fallback.magicLinkSubject,
      body: copy?.magicLinkBody || fallback.magicLinkBody,
      cta: copy?.magicLinkCta || fallback.magicLinkCta,
    }
  }
  if (kind === 'invite') {
    return {
      subject: copy?.inviteSubject || fallback.inviteSubject,
      body: copy?.inviteBody || fallback.inviteBody,
      cta: copy?.inviteCta || fallback.inviteCta,
    }
  }
  return {
    subject: copy?.passwordResetSubject || fallback.passwordResetSubject,
    body: copy?.passwordResetBody || fallback.passwordResetBody,
    cta: copy?.passwordResetCta || fallback.passwordResetCta,
  }
}

/** Render structured, escaped auth mail. Administrators can customise copy, never HTML or URLs. */
export function renderAuthEmail(input: RenderAuthEmailInput): RenderedAuthEmail {
  const productName = input.branding.productName || DEFAULT_PRODUCT_NAME
  const tenantName = input.tenantName || 'your organization'
  const tokens = { productName, tenantName }
  const copy = selectedCopy(input.kind, input.branding.email?.authEmail)
  const subject = replaceTokens(copy.subject, tokens)
  const body = replaceTokens(copy.body, tokens)
  const cta = replaceTokens(copy.cta, tokens)
  const url = asSafeHttpUrl(input.url)
  if (!url) throw new Error('[auth] Refusing to render an authentication email with an invalid URL.')
  const footer = input.branding.email?.footer
  const supportEmail = input.branding.email?.supportEmail
  const support = supportEmail ? `Need help? Contact ${supportEmail}.` : undefined
  const expiry = input.kind === 'password-reset' ? 'This link expires in 1 hour.' : 'This one-time link expires in 15 minutes.'
  const ignore =
    input.kind === 'password-reset'
      ? "If you didn't request it, ignore this email — your password won't change."
      : input.kind === 'invite'
        ? "If you weren't expecting this invitation, ignore this email."
        : "If you didn't request it, ignore this email."
  const text = [body, '', `${cta}:`, url, '', expiry, ignore, footer, support].filter(Boolean).join('\n')
  const logo = asSafeHttpUrl(input.branding.logoUrl)
  const color = asSafeColor(input.branding.primaryColor)
  const footerHtml = [footer, support]
    .filter(Boolean)
    .map((line) => `<p style="margin:4px 0">${escapeHtml(line!)}</p>`)
    .join('')
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden"><tr><td style="padding:24px;border-top:4px solid ${color}">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(productName)}" style="max-height:48px;max-width:220px" />` : `<strong style="font-size:20px;color:${color}">${escapeHtml(productName)}</strong>`}<p style="font-size:16px;line-height:24px">${escapeHtml(body)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;border-radius:6px;background:${color};color:#fff;text-decoration:none;font-weight:600">${escapeHtml(cta)}</a></p><p style="font-size:13px;line-height:20px;color:#475569">${escapeHtml(expiry)}<br/>${escapeHtml(ignore)}</p>${footerHtml ? `<div style="border-top:1px solid #e2e8f0;margin-top:20px;padding-top:12px;font-size:12px;color:#64748b">${footerHtml}</div>` : ''}</td></tr></table></td></tr></table></body></html>`
  return { subject, html, text }
}

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nextConfig = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8')
const dockerfile = readFileSync(new URL('../../../../Dockerfile', import.meta.url), 'utf8')
const devWorkflow = readFileSync(
  new URL('../../../../.github/workflows/deploy-dev.yml', import.meta.url),
  'utf8',
)
const sidebar = readFileSync(new URL('../components/app-sidebar.tsx', import.meta.url), 'utf8')
const appLayout = readFileSync(new URL('../app/(app)/layout.tsx', import.meta.url), 'utf8')

describe('self-hosted Next.js version-skew protection', () => {
  it('embeds the immutable deployment version into the Next.js build', () => {
    expect(nextConfig).toContain('deploymentId: process.env.DEPLOYMENT_VERSION')
    expect(dockerfile).toContain('ARG DEPLOYMENT_VERSION')
    expect(dockerfile).toContain('ENV DEPLOYMENT_VERSION=${DEPLOYMENT_VERSION}')
    expect(devWorkflow).toContain('DEPLOYMENT_VERSION=${{ github.sha }}')
  })

  it('uses a fresh framework-generated Server Action key in each immutable image', () => {
    expect(dockerfile).not.toContain('next_server_actions_key')
    expect(dockerfile).not.toContain('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=')
    expect(devWorkflow).not.toContain('next_server_actions_key')
    expect(devWorkflow).not.toContain('DEV_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY')
  })

  it('shows the immutable runtime version rather than the package development version', () => {
    expect(sidebar).toContain("const versionLabel = deploymentVersion?.trim() || 'dev'")
    expect(sidebar).not.toContain('<GeneratedText id="m_155b48f51ba2b4" />')
    expect(appLayout).toContain('process.env.APP_VERSION ?? process.env.DEPLOYMENT_VERSION')
  })
})

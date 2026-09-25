import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nextConfig = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8')
const dockerfile = readFileSync(new URL('../../../../Dockerfile', import.meta.url), 'utf8')
const devWorkflow = readFileSync(
  new URL('../../../../.github/workflows/deploy-dev.yml', import.meta.url),
  'utf8',
)

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
})

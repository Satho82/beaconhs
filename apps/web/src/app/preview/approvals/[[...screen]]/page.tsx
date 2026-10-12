import { Suspense, type CSSProperties } from 'react'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { AppShell } from '@/components/app-shell'
import { ThemeProvider } from '@/components/theme-provider'
import { NavigationProvider } from '@/components/navigation-provider'
import { PageContainer } from '@/components/page-layout'
import { APPROVALS_PREVIEW_NAV } from '@/lib/nav/approvals-preview'
import { previewContext, previewData } from '@/lib/approvals/preview-server'
import {
  PREVIEW_SCREENS,
  PREVIEW_SOURCES,
  type PreviewScreen,
} from '@/lib/approvals/preview-fixtures'
import { readApprovalRequest } from '@/lib/approvals/service'
import { isUuid } from '@/lib/list-params'
import { resolveTenantPrimaryAction } from '@/lib/theme-governance'
import { ApprovalsPreview } from '../preview.client'

export const dynamic = 'force-dynamic'
export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const path = (await params).screen ?? []
  const screen = path[0] ?? 'overview'
  if (
    path.length > 1 ||
    ![...PREVIEW_SCREENS.map(([id]) => id), 'detail', 'unavailable', 'guide'].includes(screen)
  )
    notFound()
  const ctx = await previewContext(),
    data = await previewData(),
    search = await searchParams
  const id = typeof search.id === 'string' ? search.id : undefined
  if (id && (!isUuid(id) || !data.requests.some((r) => r.id === id))) notFound()
  const selected =
    data.requests.find((r) => r.id === id) ??
    data.requests.find((r) => r.source_id === PREVIEW_SOURCES[0].id && r.status === 'pending') ??
    data.requests[0]
  const detail = selected
    ? JSON.parse(JSON.stringify(await readApprovalRequest(ctx, selected.id)))
    : null
  const [tenant] = await ctx.db((tx) =>
    tx.execute(sql`SELECT name,branding FROM tenants WHERE id=${ctx.tenantId}`),
  )
  const branding = (tenant?.branding ?? {}) as { primaryColor?: string; logoUrl?: string }
  const tenantName = String(tenant?.name ?? 'Synthetic review tenant')
  return (
    <ThemeProvider>
      <NavigationProvider>
        <div
          style={
            {
              '--tenant-primary-action': resolveTenantPrimaryAction(
                '#009ca6',
                branding.primaryColor,
              ),
            } as CSSProperties
          }
        >
          <Suspense>
            <AppShell
              ctx={{
                tenantId: ctx.tenantId,
                tenantName,
                isSuperAdmin: false,
                membership: ctx.membership,
              }}
              platformBranding={{ productName: 'Uvanoo' }}
              tenantBranding={{
                productName: tenantName.replace(' · Synthetic', ''),
                ...(branding.logoUrl ? { logoUrl: branding.logoUrl } : {}),
              }}
              account={{
                name: ctx.membership!.displayName,
                email: ctx.userId.replace('approvals-preview-', '') + ' · synthetic account',
              }}
              groups={APPROVALS_PREVIEW_NAV}
              availableTenants={[]}
              availableRoles={[]}
              activeRole={{
                id: null,
                name: ctx.userId.endsWith('configurator')
                  ? 'Workflow configurator'
                  : ctx.userId.endsWith('requester')
                    ? 'Request coordinator'
                    : ctx.userId.endsWith('manager')
                      ? 'Line manager'
                      : 'Finance reviewer',
              }}
              propertyContext={{ activePropertyId: null, properties: [] }}
              unreadCount={0}
              deploymentVersion="V1.4"
              deploymentEnvironment="preview"
            >
              <PageContainer className="max-w-none p-3 sm:p-4 lg:px-5 lg:py-4">
                <ApprovalsPreview
                  screen={screen as PreviewScreen}
                  data={data}
                  detail={detail}
                  selected={selected ?? null}
                  search={search}
                />
              </PageContainer>
            </AppShell>
          </Suspense>
        </div>
      </NavigationProvider>
    </ThemeProvider>
  )
}

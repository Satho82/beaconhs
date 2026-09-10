import { Palette } from 'lucide-react'
import { GeneratedValue } from '@/i18n/generated'
import { Button, Card, CardContent, CardHeader, CardTitle, DetailHeader, Input, Label } from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { getPlatformBranding } from '@/lib/platform-branding-config'
import { savePlatformBrandingAction } from './_actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Platform branding' }
}

// Authorization is enforced by /platform/layout.tsx (super-admin only).
export default async function PlatformBrandingPage() {
  const branding = await getPlatformBranding()

  return (
    <PageContainer>
      <div className="max-w-2xl space-y-4">
        <DetailHeader
          back={{ href: '/admin', label: 'Back to admin' }}
          title="Platform branding"
          subtitle="Configure the product identity shown across the platform."
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette size={17} />
              Platform branding settings
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form action={savePlatformBrandingAction} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Product name">
                  <Input
                    name="productName"
                    defaultValue={branding.productName ?? ''}
                    placeholder="Uvanoo"
                    maxLength={100}
                  />
                </Field>

                <Field label="Primary colour">
                  <Input
                    name="primaryColor"
                    defaultValue={branding.primaryColor ?? ''}
                    placeholder="#1B2B4A"
                    maxLength={50}
                  />
                </Field>

                <Field label="Logo URL" className="sm:col-span-2">
                  <Input
                    name="logoUrl"
                    defaultValue={branding.logoUrl ?? ''}
                    placeholder="https://…"
                    maxLength={2_000}
                  />
                </Field>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                These settings control the product-wide identity. Individual tenant branding
                remains separate and can override branding where tenant-specific branding is used.
              </p>

              <GeneratedValue
                value={
                  branding.logoUrl ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <Label className="text-xs">Preview</Label>
                      <div className="mt-2 flex items-center gap-3">
                        <img
                          src={branding.logoUrl}
                          alt=""
                          className="h-10 w-auto object-contain"
                        />
                        <span
                          className="font-semibold"
                          style={{ color: branding.primaryColor ?? '#1B2B4A' }}
                        >
                          {branding.productName || 'BeaconHS'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 dark:border-slate-800">
                      <span
                        className="font-semibold"
                        style={{ color: branding.primaryColor ?? '#1B2B4A' }}
                      >
                        {branding.productName || 'BeaconHS'}
                      </span>
                    </div>
                  )
                }
              />

              <div className="flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
                <Button type="submit">Save branding</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

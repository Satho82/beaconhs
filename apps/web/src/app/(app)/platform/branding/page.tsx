import { Palette } from 'lucide-react'
import { getGeneratedTranslations, getGeneratedValueTranslations } from '@/i18n/generated.server'
import { GeneratedValue } from '@/i18n/generated'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DetailHeader,
  Input,
  Label,
} from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { getPlatformBranding } from '@/lib/platform-branding-config'
import { savePlatformBrandingAction } from './_actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const tGenerated = await getGeneratedTranslations()
  return { title: tGenerated('m_17d3955fc7b8c9') }
}

// Authorization is enforced by /platform/layout.tsx (super-admin only).
export default async function PlatformBrandingPage() {
  const branding = await getPlatformBranding()
  const tGenerated = await getGeneratedTranslations()
  const tGeneratedValue = await getGeneratedValueTranslations()

  return (
    <PageContainer>
      <div className="max-w-2xl space-y-4">
        <DetailHeader
          back={{ href: '/admin', label: tGenerated('m_1d8f8f623b8111') }}
          title={tGenerated('m_17d3955fc7b8c9')}
          subtitle={tGenerated('m_0431e1142db314')}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette size={17} />
              {tGenerated('m_07edc6fdc3e5fb')}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form action={savePlatformBrandingAction} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={tGenerated('m_0940e3cad188a2')}>
                  <Input
                    name="productName"
                    defaultValue={branding.productName ?? ''}
                    placeholder={tGenerated('m_13f7e9eb21e87b')}
                    maxLength={100}
                  />
                </Field>

                <Field label={tGenerated('m_035b646ef021c8')}>
                  <Input
                    name="primaryColor"
                    defaultValue={branding.primaryColor ?? ''}
                    placeholder={tGenerated('m_0c59e0fdca76d8')}
                    maxLength={50}
                  />
                </Field>

                <Field label={tGenerated('m_0b4e6d5c6d8b13')} className="sm:col-span-2">
                  <Input
                    name="logoUrl"
                    defaultValue={branding.logoUrl ?? ''}
                    placeholder={tGenerated('m_01e62c5040aa0e')}
                    maxLength={2_000}
                  />
                </Field>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tGenerated('m_1aa9e4f97037d4')}
              </p>

              <GeneratedValue
                value={
                  branding.logoUrl ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <Label className="text-xs">{tGenerated('m_11d37007232de5')}</Label>
                      <div className="mt-2 flex items-center gap-3">
                        <img src={branding.logoUrl} alt="" className="h-10 w-auto object-contain" />
                        <span
                          className="font-semibold"
                          style={{ color: branding.primaryColor ?? '#1B2B4A' }}
                        >
                          {branding.productName || tGenerated('m_1721f79d9a7f66')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 dark:border-slate-800">
                      <span
                        className="font-semibold"
                        style={{ color: branding.primaryColor ?? '#1B2B4A' }}
                      >
                        {branding.productName || tGenerated('m_1721f79d9a7f66')}
                      </span>
                    </div>
                  )
                }
              />

              <div className="flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
                <Button type="submit">{tGenerated('m_17acc9d94c2c8c')}</Button>
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

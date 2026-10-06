import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { requirePlatformOperator } from '@/lib/auth'
import { PRODUCT_NAME } from '@/lib/brand'
import { Logo } from '@/components/brand-logo'
import { Palette } from 'lucide-react'
import { getGeneratedTranslations } from '@/i18n/generated.server'
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
import { platformBrandAssetUrl } from '@/lib/platform-brand-asset-url'
import { savePlatformBrandingAction } from './_actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const tGenerated = await getGeneratedTranslations()
  return { title: tGenerated('m_17d3955fc7b8c9') }
}

// Authorization is enforced by /platform/layout.tsx (super-admin only).
export default async function PlatformBrandingPage() {
  const tBoard = await getGeneratedValueTranslations()

  await requirePlatformOperator()
  const branding = await getPlatformBranding()
  const tGenerated = await getGeneratedTranslations()
  const faviconUrl = platformBrandAssetUrl('favicon', branding.faviconKey)

  return (
    <PageContainer>
      <div className="max-w-5xl space-y-5">
        <DetailHeader
          back={{ href: '/platform', label: 'Platform administration' }}
          title={tGenerated('m_17d3955fc7b8c9')}
          subtitle={tGenerated('m_0431e1142db314')}
        />

        <section
          aria-label={tBoard('Saved platform identity preview')}
          className="grid gap-4 sm:grid-cols-3"
        >
          <div className="rounded-xl bg-[rgb(var(--color-sidebar))] p-5 text-white">
            <p className="mb-4 text-xs text-slate-300">{tBoard('Sidebar masthead')}</p>
            <Logo branding={branding} className="h-8 w-auto max-w-full rounded bg-white p-1" />
          </div>
          <div className="rounded-xl border bg-white p-5 dark:bg-slate-900">
            <p className="text-xs text-slate-500">{tBoard('Login identity')}</p>
            <p className="mt-4 text-xl font-semibold">
              {branding.productName?.trim() || PRODUCT_NAME}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-5 dark:bg-slate-900">
            <p className="text-xs text-slate-500">{tBoard('Browser-title example')}</p>
            <p className="mt-4 text-sm break-words">
              {tBoard('Dashboard ·')} {branding.productName?.trim() || PRODUCT_NAME}
            </p>
          </div>
        </section>
        <p className="text-xs text-slate-500">
          {tBoard(
            'Preview reflects the saved master branding. Light/Terra is the shared design system; tenant branding cannot change this platform identity.',
          )}
        </p>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette size={17} />
              {tGenerated('m_07edc6fdc3e5fb')}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form
              action={savePlatformBrandingAction}
              className="space-y-8"
              encType="multipart/form-data"
            >
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
              </div>

              <section className="space-y-5 border-t border-slate-100 pt-6 dark:border-slate-800">
                <h2 className="font-semibold">{tGenerated('m_2a8f4c7d1e3b90')}</h2>

                <BrandAssetField
                  name="logo"
                  label={tGenerated('m_3b9d5e8f2a4c71')}
                  help={tGenerated('m_4c1e6a9b3d5f82')}
                  accept="image/png,image/jpeg,image/webp"
                  preview={
                    branding.logoUrl ? (
                      <img src={branding.logoUrl} alt="" className="h-10 max-w-40 object-contain" />
                    ) : (
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {tGenerated('m_b8f4c7d1e3a259')}
                      </span>
                    )
                  }
                  hasCustomAsset={Boolean(branding.logoKey || branding.logoUrl)}
                  resetName="resetLogo"
                  resetLabel={tGenerated('m_0a5029e50c13da')}
                  uploadLabel={tGenerated('m_06dc5804d9c769')}
                />

                <BrandAssetField
                  name="favicon"
                  label={tGenerated('m_5d2f7b1c4e6a93')}
                  help={tGenerated('m_6e3a8c2d5f7b04')}
                  accept="image/png,image/x-icon,image/vnd.microsoft.icon,.ico"
                  preview={
                    <img
                      src={faviconUrl ?? '/favicon.ico'}
                      alt=""
                      className="h-8 w-8 object-contain"
                    />
                  }
                  hasCustomAsset={Boolean(branding.faviconKey)}
                  resetName="resetFavicon"
                  resetLabel={tGenerated('m_0a5029e50c13da')}
                  uploadLabel={tGenerated('m_06dc5804d9c769')}
                  emptyLabel={tGenerated('m_c9a5d8e2f4b360')}
                />
              </section>

              <section className="space-y-4 border-t border-slate-100 pt-6 dark:border-slate-800">
                <div>
                  <h2 className="font-semibold">{tGenerated('m_7f4b9d3e6a8c15')}</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {tGenerated('m_a7e3b6c9d2f148')}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="analyticsEnabled"
                    defaultChecked={branding.analytics?.enabled ?? false}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {tGenerated('m_8a5c1e4f7b9d26')}
                </label>
                <Field label={tGenerated('m_9b6d2f5a8c1e37')}>
                  <Input
                    name="googleTagId"
                    defaultValue={branding.analytics?.googleTagId ?? ''}
                    placeholder={tGenerated('m_d1e4a7c2f5b369')}
                    maxLength={50}
                    autoCapitalize="characters"
                  />
                </Field>
              </section>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tGenerated('m_1aa9e4f97037d4')}
              </p>

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

function BrandAssetField({
  name,
  label,
  help,
  accept,
  preview,
  hasCustomAsset,
  resetName,
  resetLabel,
  uploadLabel,
  emptyLabel,
}: {
  name: string
  label: string
  help: string
  accept: string
  preview: React.ReactNode
  hasCustomAsset: boolean
  resetName: string
  resetLabel: string
  uploadLabel: string
  emptyLabel?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Label>{label}</Label>
          <div className="flex h-12 items-center">{preview}</div>
          {!hasCustomAsset && emptyLabel ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{emptyLabel}</p>
          ) : null}
          <p className="text-xs text-slate-500 dark:text-slate-400">{help}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            {uploadLabel}
            <input name={name} type="file" accept={accept} className="sr-only" />
          </label>
          {hasCustomAsset ? (
            <Button type="submit" name={resetName} value="1" variant="outline">
              {resetLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
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

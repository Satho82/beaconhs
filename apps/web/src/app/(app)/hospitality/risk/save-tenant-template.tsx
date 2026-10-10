'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Drawer, Input, Textarea } from '@beaconhs/ui'
import { useGeneratedValueTranslations } from '@/i18n/generated'
import type { RiskTemplateSource } from '@/lib/risk-tenant-templates'
import { saveTenantRiskTemplateAction } from './actions'

export function SaveTenantTemplate({
  source,
  title,
  description,
}: {
  source: RiskTemplateSource
  title: string
  description: string
}) {
  const t = useGeneratedValueTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(title)
  const [summary, setSummary] = useState(description)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  function save() {
    setError('')
    start(async () => {
      try {
        const result = await saveTenantRiskTemplateAction({
          source,
          title: name,
          description: summary,
        })
        setOpen(false)
        router.push(`/hospitality/risk/templates/${result.templateId}`)
      } catch {
        setError(
          t('The tenant template could not be saved. Check the title is unique and try again.'),
        )
      }
    })
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setError('')
          setOpen(true)
        }}
      >
        {t('Save as Tenant Template')}
      </Button>
      <Drawer
        open={open}
        onClose={() => {
          if (!pending) setOpen(false)
        }}
        title={t('Save as Tenant Template')}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <fieldset disabled={pending} className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {t(
                'This creates a separate tenant draft. Review its content and publish it before it can be used for assessments.',
              )}
            </p>
            {source.kind === 'assessment' && (
              <p className="text-muted-foreground text-sm">
                {t(
                  'Uses the last saved assessment content. Save your assessment edits first. Corrective-action records, owners and sign-offs are not copied.',
                )}
              </p>
            )}
            <label className="block text-sm font-medium">
              {t('Title')}
              <Input
                className="mt-1"
                value={name}
                maxLength={300}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              {t('Description')}
              <Textarea
                className="mt-1"
                value={summary}
                maxLength={5000}
                required
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={!name.trim() || !summary.trim()}>
                {pending ? t('Saving…') : t('Save as Tenant Template')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('Cancel')}
              </Button>
            </div>
          </fieldset>
        </form>
      </Drawer>
    </>
  )
}

import Link from 'next/link'
import { Button } from '@beaconhs/ui'
import { riskViewHref, type RiskSearch, type RiskView } from '@/lib/risk-library-views'
import { useGeneratedValueTranslations } from '@/i18n/generated'

export function RiskViewTabs({ search, view }: { search: RiskSearch; view: RiskView }) {
  const translateValue = useGeneratedValueTranslations()
  return (
    <nav
      aria-label={translateValue('Risk Assessment views')}
      className="mt-5 flex flex-wrap gap-2 border-b pb-3"
    >
      {(
        [
          ['templates', 'Available Templates'],
          ['assessments', 'Property Risk Assessments'],
        ] as const
      ).map(([key, label]) => (
        <Button key={key} asChild variant={view === key ? 'default' : 'ghost'}>
          <Link href={riskViewHref(search, key)} aria-current={view === key ? 'page' : undefined}>
            {label}
          </Link>
        </Button>
      ))}
    </nav>
  )
}

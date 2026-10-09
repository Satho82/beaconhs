import { useTranslations } from 'next-intl'
const STAGE_KEYS = {
  Upload: 'm_136064c1a8aa9b',
  Preview: 'm_11d37007232de5',
  Review: 'm_0e315ebf127b18',
  Import: 'm_0df79ee8347c6b',
  Result: 'm_100e41041dbe51',
} as const
const STAGES = ['Upload', 'Preview', 'Review', 'Import', 'Result'] as const
export function PropertyImportSteps({ current }: { current: (typeof STAGES)[number] }) {
  const tBatch = useTranslations('Generated')

  return (
    <ol aria-label={tBatch('m_1fe40c02004935')} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {STAGES.map((stage, index) => (
        <li
          key={stage}
          aria-current={stage === current ? 'step' : undefined}
          className={
            stage === current
              ? 'rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm font-semibold text-blue-800'
              : 'rounded-lg border border-slate-200 p-3 text-sm text-slate-500'
          }
        >
          <span aria-hidden="true" className="mr-2">
            {index + 1}.
          </span>
          {tBatch(STAGE_KEYS[stage])}
        </li>
      ))}
    </ol>
  )
}

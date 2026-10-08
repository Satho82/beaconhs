const STAGES = ['Upload', 'Preview', 'Review', 'Import', 'Result'] as const
export function PropertyImportSteps({ current }: { current: (typeof STAGES)[number] }) {
  return (
    <ol
      aria-label="Property Structure import progress"
      className="grid grid-cols-2 gap-2 sm:grid-cols-5"
    >
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
          {stage}
        </li>
      ))}
    </ol>
  )
}

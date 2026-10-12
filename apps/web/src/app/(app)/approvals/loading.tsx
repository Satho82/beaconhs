import { GeneratedValue } from '@/i18n/generated'
export default function Loading() {
  return (
    <p role="status" className="p-6 text-sm">
      <GeneratedValue value={'Loading approvals…'} />
    </p>
  )
}

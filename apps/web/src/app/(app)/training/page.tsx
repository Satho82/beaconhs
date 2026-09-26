import { redirect } from 'next/navigation'
import { can } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { TRAINING_TAB_PERMISSIONS } from '@/lib/training-access'

export default async function TrainingIndexPage() {
  const ctx = await requireRequestContext()
  redirect(
    TRAINING_TAB_PERMISSIONS.records.some((permission) => can(ctx, permission))
      ? '/training/records'
      : '/training/courses',
  )
}

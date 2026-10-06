'use client'

import { AdminLoadFailure } from '@/components/admin-load-failure'
import { PageContainer } from '@/components/page-layout'

export function AdminPageError({ reset }: { reset: () => void }) {
  return (
    <PageContainer>
      <AdminLoadFailure reset={reset} />
    </PageContainer>
  )
}

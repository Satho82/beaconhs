'use client'
import { GeneratedValue } from '@/i18n/generated'

import { Button } from '@beaconhs/ui'
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4 p-6">
      <p role="alert">
        <GeneratedValue
          value={
            'Approvals could not be loaded. Check your current tenant, property access and module entitlement.'
          }
        />
      </p>
      <Button onClick={reset}>
        <GeneratedValue value={'Try again'} />
      </Button>
    </div>
  )
}

import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

/** The retired HazID application is preserved as data, not as an active workflow. */
export default function RetiredHazardAssessmentsLayout({ children }: { children: ReactNode }) {
  void children
  redirect('/hospitality/risk')
}

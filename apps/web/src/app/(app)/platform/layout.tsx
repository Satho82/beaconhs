import { GeneratedValue } from '@/i18n/generated'
import { redirect } from 'next/navigation'
import { getPlatformOperator } from '@/lib/auth'

// Single authorization gate for the entire platform (super-admin) area. Every
// page under /platform is deployment-wide, so it must NOT be reachable by tenant
// users.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const operator = await getPlatformOperator()
  if (!operator) redirect('/admin')
  return (
    <>
      <GeneratedValue value={children} />
    </>
  )
}

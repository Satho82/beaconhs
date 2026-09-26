import { randomUUID } from 'node:crypto'
import { notFound } from 'next/navigation'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { resolveGuestRoomTarget } from '@/lib/hospitality/guest-maintenance'
import { GuestReportForm } from './guest-report-form'

export const dynamic = 'force-dynamic'

export default async function GuestMaintenancePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const translateValue = await getGeneratedValueTranslations()
  const { token } = await params
  const target = await resolveGuestRoomTarget(token)
  if (!target) notFound()
  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8 text-slate-950 sm:py-12">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#0b6978] uppercase">
            {translateValue('Uvanoo Guest Services')}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{translateValue('Report a room issue')}</h1>
          <p className="mt-2 text-slate-600">
            {target.propertyName} · {translateValue('Room')} {target.roomName || target.roomCode}
          </p>
        </header>
        <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
          <GuestReportForm token={token} submissionId={randomUUID()} />
        </section>
      </div>
    </main>
  )
}

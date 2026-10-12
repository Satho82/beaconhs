import { getGeneratedTranslations } from '@/i18n/generated.server'
import { assertLocalPreview } from '@/lib/approvals/preview-server'
import { PREVIEW_ROOT, PREVIEW_PEOPLE } from '@/lib/approvals/preview-fixtures'
import { Button, Card } from '@beaconhs/ui'
export default async function PreviewLogin() {
  const translateApprovals = await getGeneratedTranslations()

  await assertLocalPreview()
  return (
    <main className="grid h-dvh place-items-center overflow-y-auto p-6">
      <Card className="max-w-lg space-y-5 p-8">
        <p className="text-sm font-semibold text-teal-700">
          {translateApprovals('m_19389efb6d4446')}
        </p>
        <h1 className="text-2xl font-semibold">{translateApprovals('m_0b1b270da95164')}</h1>
        <p className="text-sm text-slate-600"> {translateApprovals('m_1cd55de8a772d2')} </p>
        <div className="grid gap-3">
          {Object.entries(PREVIEW_PEOPLE).map(([role, person]) => (
            <form key={role} action={`${PREVIEW_ROOT}/session`} method="post">
              <input type="hidden" name="role" value={role} />
              <Button
                type="submit"
                variant={role === 'requester' ? 'default' : 'outline'}
                className="w-full"
              >
                {' '}
                {translateApprovals('m_09a050d7ae8d4b')} {role} · {person.name}
              </Button>
            </form>
          ))}
        </div>
        <p className="text-xs text-slate-500"> {translateApprovals('m_181ee43a896146')} </p>
      </Card>
    </main>
  )
}

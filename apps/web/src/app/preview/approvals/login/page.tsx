import { assertLocalPreview } from '@/lib/approvals/preview-server'
import { PREVIEW_ROOT, PREVIEW_PEOPLE } from '@/lib/approvals/preview-fixtures'
import { Button, Card } from '@beaconhs/ui'
export default async function PreviewLogin() {
  await assertLocalPreview()
  return (
    <main className="grid h-dvh place-items-center overflow-y-auto p-6">
      <Card className="max-w-lg space-y-5 p-8">
        <p className="text-sm font-semibold text-teal-700">UVANOO V1.4 · ISOLATED REVIEW</p>
        <h1 className="text-2xl font-semibold">Approvals visual preview</h1>
        <p className="text-sm text-slate-600">
          Choose a synthetic review account. This creates a real authenticated session in the
          isolated fixture. No DEV records, passwords or production access are involved.
        </p>
        <div className="grid gap-3">
          {Object.entries(PREVIEW_PEOPLE).map(([role, person]) => (
            <form key={role} action={`${PREVIEW_ROOT}/session`} method="post">
              <input type="hidden" name="role" value={role} />
              <Button
                type="submit"
                variant={role === 'requester' ? 'default' : 'outline'}
                className="w-full"
              >
                Continue as {role} · {person.name}
              </Button>
            </form>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Requester: submit only. Manager: first-stage decisions. Finance: second-stage decisions.
          Configurator: property-scoped workflow settings only, without decision or submission
          grants. Session cookies use localhost, separate from the People preview at 127.0.0.1.
        </p>
      </Card>
    </main>
  )
}

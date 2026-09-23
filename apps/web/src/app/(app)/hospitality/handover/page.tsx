import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { Pagination } from '@/components/pagination'
import { SearchInput } from '@/components/search-input'
import { TableToolbar } from '@/components/table-toolbar'
import { PhotoUploaderSection } from '@/components/photo-uploader-section'
import { requireRequestContext } from '@/lib/auth'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { parseListParams } from '@/lib/list-params'
import {
  requireAuthoringProperty,
  resolveHospitalityPropertyContext,
} from '@/lib/hospitality/property-context'
import {
  acknowledgeHandover,
  attachHandoverPhotos,
  carryForwardHandover,
  commentOnHandover,
  createHandover,
  handoverFormOptions,
  listHandovers,
  updateHandoverFollowUp,
  type HandoverPriority,
  type HandoverShift,
} from '@/lib/hospitality/handover'
import { can } from '@beaconhs/tenant'

const BASE = '/hospitality/handover'
const shifts: HandoverShift[] = ['am', 'pm', 'night', 'custom']
const priorities: HandoverPriority[] = ['routine', 'important', 'urgent']

function text(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim()
}

async function createEntry(form: FormData) {
  'use server'
  const ctx = await requireRequestContext()
  const shift = text(form, 'shift') as HandoverShift
  const priority = text(form, 'priority') as HandoverPriority
  if (!shifts.includes(shift) || !priorities.includes(priority))
    throw new Error('Invalid handover selection.')
  const occurredAt = new Date(text(form, 'occurredAt'))
  const propertyId = text(form, 'propertyId')
  const requiredPropertyId = await requireAuthoringProperty(ctx)
  if (requiredPropertyId && propertyId !== requiredPropertyId) {
    throw new Error('Create this Handover entry in the property selected in the Property Switcher.')
  }
  await createHandover(ctx, {
    propertyId,
    occurredAt,
    shift,
    customShift: text(form, 'customShift') || undefined,
    department: text(form, 'department'),
    note: text(form, 'note'),
    priority,
    roomId: text(form, 'roomId') || undefined,
    location: text(form, 'location') || undefined,
    followUpRequired: form.get('followUpRequired') === 'on',
    followUpOwnerId: text(form, 'followUpOwnerId') || undefined,
    maintenanceIssueId: text(form, 'maintenanceIssueId') || undefined,
    createCorrectiveAction: form.get('createCorrectiveAction') === 'on',
  })
  revalidatePath(BASE)
}

async function acknowledge(id: string) {
  'use server'
  await acknowledgeHandover(await requireRequestContext(), id)
  revalidatePath(BASE)
}

async function addComment(id: string, form: FormData) {
  'use server'
  await commentOnHandover(await requireRequestContext(), id, text(form, 'body'))
  revalidatePath(BASE)
}

async function setFollowUp(id: string, form: FormData) {
  'use server'
  const status = text(form, 'status')
  if (!['open', 'in_progress', 'completed'].includes(status))
    throw new Error('Invalid follow-up status.')
  await updateHandoverFollowUp(
    await requireRequestContext(),
    id,
    status as 'open' | 'in_progress' | 'completed',
  )
  revalidatePath(BASE)
}

async function carryForward(id: string) {
  'use server'
  await carryForwardHandover(await requireRequestContext(), id)
  revalidatePath(BASE)
}

async function attachPhotos(id: string, attachmentIds: string[]) {
  'use server'
  await attachHandoverPhotos(await requireRequestContext(), id, attachmentIds)
  revalidatePath(BASE)
}

export default async function HandoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getGeneratedValueTranslations()
  const ctx = await requireRequestContext()
  const propertyContext = await resolveHospitalityPropertyContext(ctx)
  const search = await searchParams
  const params = parseListParams(search, {
    sort: 'occurred',
    dir: 'desc',
    allowedSorts: ['occurred'] as const,
  })
  const [data, options] = await Promise.all([
    listHandovers(ctx, {
      propertyId: propertyContext.activePropertyId,
      q: params.q,
      page: params.page,
      perPage: params.perPage,
    }),
    handoverFormOptions(
      ctx,
      propertyContext.activePropertyId
        ? [propertyContext.activePropertyId]
        : propertyContext.properties.map((property) => property.id),
    ),
  ])
  const mayManage = can(ctx, 'hospitality.manage')
  const authoringProperties = propertyContext.activePropertyId
    ? propertyContext.properties.filter(
        (property) => property.id === propertyContext.activePropertyId,
      )
    : propertyContext.properties
  const now = new Date()
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)

  return (
    <PageContainer>
      <PageHeader
        title={t('Hotel Handover')}
        description={t(
          'A chronological shift record across the properties you are authorised to access.',
        )}
      />

      {mayManage ? (
        <Card className="mt-5">
          <CardContent className="pt-6">
            <form action={createEntry} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>{t('Property')}</span>
                <Select
                  name="propertyId"
                  required
                  defaultValue={propertyContext.activePropertyId ?? ''}
                >
                  <option value="" disabled>
                    {t('Choose a property')}
                  </option>
                  {authoringProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Date and time')}</span>
                <Input name="occurredAt" type="datetime-local" required defaultValue={localNow} />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Shift')}</span>
                <Select name="shift" defaultValue="am">
                  {shifts.map((shift) => (
                    <option key={shift} value={shift}>
                      {shift === 'am'
                        ? t('AM')
                        : shift === 'pm'
                          ? t('PM')
                          : shift === 'night'
                            ? t('Night')
                            : t('Custom')}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Custom shift name')}</span>
                <Input name="customShift" placeholder={t('Only needed for a custom shift')} />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Department')}</span>
                <Input
                  name="department"
                  required
                  placeholder={t('Front Office, Housekeeping, Engineering…')}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Priority')}</span>
                <Select name="priority" defaultValue="routine">
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority[0]?.toUpperCase()}
                      {priority.slice(1)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Room (optional)')}</span>
                <Select name="roomId" defaultValue="">
                  <option value="">{t('No room')}</option>
                  {options.rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.code} — {room.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Location (optional)')}</span>
                <Input name="location" placeholder={t('Lobby, plant room, loading bay…')} />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span>{t('Handover note')}</span>
                <Textarea name="note" required rows={4} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="followUpRequired" type="checkbox" />
                {t('Follow-up required')}
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Follow-up owner (optional)')}</span>
                <Select name="followUpOwnerId" defaultValue="">
                  <option value="">{t('Unassigned')}</option>
                  {options.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('Existing maintenance issue (optional)')}</span>
                <Select name="maintenanceIssueId" defaultValue="">
                  <option value="">{t('No maintenance link')}</option>
                  {options.maintenance.map((issue) => (
                    <option key={issue.id} value={issue.id}>
                      {issue.reference} — {issue.summary}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="createCorrectiveAction" type="checkbox" />
                {t('Create a shared Corrective Action')}
              </label>
              <div className="md:col-span-2">
                <Button type="submit">{t('Add handover entry')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <TableToolbar className="mt-5">
        <SearchInput placeholder={t('Search handover notes, department, location or property…')} />
      </TableToolbar>

      {data.rows.length === 0 ? (
        <EmptyState title={t('No handover entries found')} />
      ) : (
        <div className="mt-4 space-y-4">
          {data.rows.map(
            ({ handover, propertyName, roomCode, authorName, comments, acknowledgements }) => (
              <Card key={handover.id}>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{handover.department}</div>
                      <div className="text-muted-foreground text-sm">
                        {propertyName} ·{' '}
                        {handover.shift === 'custom'
                          ? handover.customShift
                          : handover.shift.toUpperCase()}{' '}
                        · {handover.occurredAt.toLocaleString('en-GB')} · {authorName}
                      </div>
                    </div>
                    <span className="rounded-full border px-2 py-1 text-xs font-medium">
                      {handover.priority}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{handover.note}</p>
                  {roomCode || handover.location ? (
                    <div className="text-muted-foreground text-sm">
                      {[roomCode ? `Room ${roomCode}` : null, handover.location]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span>
                      {acknowledgements} {t('acknowledgement(s)')}
                    </span>
                    <span>
                      {comments} {t('update(s)')}
                    </span>
                    {handover.followUpRequired ? (
                      <span>
                        {t('Follow-up:')} {handover.followUpStatus.replaceAll('_', ' ')}
                      </span>
                    ) : null}
                    {handover.maintenanceIssueId ? (
                      <Link
                        className="underline"
                        href={`/hospitality/maintenance/${handover.maintenanceIssueId}`}
                      >
                        {t('Maintenance issue')}
                      </Link>
                    ) : null}
                    {handover.correctiveActionId ? (
                      <Link
                        className="underline"
                        href={`/corrective-actions/${handover.correctiveActionId}`}
                      >
                        {t('Corrective Action')}
                      </Link>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={acknowledge.bind(null, handover.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        {t('Acknowledge')}
                      </Button>
                    </form>
                    {mayManage && handover.followUpRequired ? (
                      <form action={setFollowUp.bind(null, handover.id)} className="flex gap-2">
                        <Select
                          name="status"
                          defaultValue={
                            handover.followUpStatus === 'not_required'
                              ? 'open'
                              : handover.followUpStatus
                          }
                        >
                          <option value="open">{t('Open')}</option>
                          <option value="in_progress">{t('In progress')}</option>
                          <option value="completed">{t('Completed')}</option>
                        </Select>
                        <Button type="submit" variant="outline" size="sm">
                          {t('Update follow-up')}
                        </Button>
                      </form>
                    ) : null}
                    {mayManage &&
                    handover.priority !== 'routine' &&
                    handover.followUpRequired &&
                    handover.followUpStatus !== 'completed' ? (
                      <form action={carryForward.bind(null, handover.id)}>
                        <Button type="submit" variant="outline" size="sm">
                          {t('Carry forward')}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                  {mayManage ? (
                    <>
                      <form action={addComment.bind(null, handover.id)} className="flex gap-2">
                        <Input name="body" required placeholder={t('Add an update…')} />
                        <Button type="submit" variant="outline">
                          {t('Add update')}
                        </Button>
                      </form>
                      <PhotoUploaderSection attachAction={attachPhotos.bind(null, handover.id)} />
                    </>
                  ) : null}
                </CardContent>
              </Card>
            ),
          )}
        </div>
      )}
      <Pagination
        basePath={BASE}
        currentParams={search}
        total={data.total}
        page={params.page}
        perPage={params.perPage}
      />
    </PageContainer>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { FileUpload, type AttachedFile } from '@/components/file-upload'
import { Button, Input, Label, Select, Textarea } from '@beaconhs/ui'
import { useGeneratedValueTranslations } from '@/i18n/generated'
import { reportMaintenanceIssueAction } from '@/app/(app)/hospitality/properties/actions'

type PropertyOption = { id: string; name: string }
type RoomOption = { id: string; propertyId: string; label: string }

export function QuickMaintenanceForm({
  properties,
  rooms,
}: {
  properties: PropertyOption[]
  rooms: RoomOption[]
}) {
  const t = useGeneratedValueTranslations()
  const [photos, setPhotos] = useState<AttachedFile[]>([])
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0]!.id : '')
  const availableRooms = useMemo(
    () => rooms.filter((room) => !propertyId || room.propertyId === propertyId),
    [propertyId, rooms],
  )

  return (
    <form action={reportMaintenanceIssueAction} className="uv-surface mt-6 grid gap-5 p-5 sm:p-6">
      <input type="hidden" name="source" value="front_office" />
      {properties.length === 1 ? (
        <div className="rounded-lg bg-[rgb(var(--color-primary)/0.06)] px-4 py-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('Property')}</p>
          <p className="mt-1 text-sm font-semibold">{properties[0]!.name}</p>
          <input type="hidden" name="propertyId" value={properties[0]!.id} />
        </div>
      ) : (
        <Label className="space-y-2">
          {t('Property')}
          <Select
            name="propertyId"
            required
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
          >
            <option value="">{t('Choose a property')}</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </Label>
      )}
      <Label className="space-y-2">
        {t('Location / room')}
        <Select name="roomId" required disabled={!propertyId}>
          <option value="">{t('Choose a room')}</option>
          {availableRooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.label}
            </option>
          ))}
        </Select>
      </Label>
      <Label className="space-y-2">
        {t('Problem')}
        <Input name="title" required maxLength={200} placeholder={t('What is broken?')} />
      </Label>
      <Label className="space-y-2">
        {t('Details')}
        <Textarea
          name="description"
          className="min-h-24"
          maxLength={2000}
          placeholder={t('Add a short description (optional)')}
        />
      </Label>
      <Label className="space-y-2">
        {t('Priority')}
        <Select name="priority" defaultValue="medium">
          <option value="low">{t('Low')}</option>
          <option value="medium">{t('Medium')}</option>
          <option value="high">{t('High')}</option>
          <option value="critical">{t('Critical')}</option>
        </Select>
      </Label>
      <div>
        <p className="mb-2 text-sm font-medium">{t('Photo / evidence (optional)')}</p>
        <FileUpload variant="photo" value={photos} onChange={setPhotos} maxFiles={10} />
        {photos.map((photo) => (
          <input
            key={photo.attachmentId}
            type="hidden"
            name="attachmentId"
            value={photo.attachmentId}
          />
        ))}
      </div>
      <Button type="submit" className="w-full sm:w-auto sm:justify-self-start">
        {t('Submit maintenance issue')}
      </Button>
    </form>
  )
}

export type MeterType = 'electricity' | 'gas' | 'water' | 'custom'

export type MeterDefinition = {
  name: string
  meterType: MeterType
  location: string
  serialNumber: string
  mpan: string | null
  measurementUnit: string
  notes: string | null
  installedAt: string
  openingReading: number
  previousMeterId: string | null
  replacementDate: string | null
}

export function sameMeterDefinition(
  existing: MeterDefinition,
  requested: MeterDefinition,
): boolean {
  return (
    existing.name === requested.name &&
    existing.meterType === requested.meterType &&
    existing.location === requested.location &&
    existing.serialNumber === requested.serialNumber &&
    existing.mpan === requested.mpan &&
    existing.measurementUnit === requested.measurementUnit &&
    existing.notes === requested.notes &&
    existing.installedAt === requested.installedAt &&
    Number(existing.openingReading) === requested.openingReading &&
    existing.previousMeterId === requested.previousMeterId &&
    existing.replacementDate === requested.replacementDate
  )
}

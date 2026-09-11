import Link from 'next/link'
import { Button, EmptyState, PageHeader } from '@beaconhs/ui'
import { requireRequestContext } from '@/lib/auth'
import { listProperties } from '@/lib/hospitality/properties'

/** Additive Uvanoo module; the existing tenant dashboard remains unchanged. */
export default async function HospitalityPropertiesPage() {
  const ctx = await requireRequestContext()
  const properties = await listProperties(ctx)
  return <main className="mx-auto max-w-5xl p-4 sm:p-6"><PageHeader title="Properties" description="Manage hospitality properties, buildings, floors and rooms." action={<Button asChild><Link href="/hospitality/properties/new">Add property</Link></Button>} />{properties.length === 0 ? <EmptyState title="No properties yet" description="Create the first property to start its building and room hierarchy." /> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{properties.map((property) => <Link className="rounded-lg border p-4" href={`/hospitality/properties/${property.id}`} key={property.id}><strong>{property.name}</strong><p className="text-sm text-muted-foreground">{property.code} · {property.timezone}</p></Link>)}</div>}</main>
}

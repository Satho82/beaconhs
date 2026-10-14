import { describe, expect, it } from 'vitest'
import { canonical, logicalCatalog, LOGICAL_SCHEMA_PROFILE } from './dev-logical-catalog'
import { schemaFingerprint } from './dev-migration-gate'
function fixture() {
  const sections: Record<string, unknown>[][] = Array.from({ length: 19 }, () => [])
  const column = {
    nspname: 'public',
    relname: 'fixture',
    attname: 'a',
    attnum: 1,
    type: 'text',
    attnotnull: true,
    attidentity: '',
    attgenerated: '',
    attstorage: 'x',
    attcompression: '',
    collation: 'default',
    acl: null,
    expression: null,
  }
  sections[3] = [column, { ...column, attname: 'b', attnum: 4 }]
  const type = {
    nspname: 'public',
    typname: 'state',
    typtype: 'e',
    owner: 'beaconhs_owner',
    acl: null,
    enumlabel: 'first',
    enumsortorder: 1,
  }
  sections[10] = [type, { ...type, enumlabel: 'second', enumsortorder: 1.5 }]
  return sections
}
describe('versioned logical schema profile', () => {
  it('normalizes only physical numbering without mutating raw input', async () => {
    const a = fixture(),
      original = structuredClone(a),
      b = structuredClone(a)
    b[3]![1]!.attnum = 2
    b[10]![1]!.enumsortorder = 2
    expect(logicalCatalog(a)).toEqual(logicalCatalog(b))
    expect(a).toEqual(original)
    const fingerprint = async (s: typeof a, profile?: typeof LOGICAL_SCHEMA_PROFILE) => {
      let i = 0
      return schemaFingerprint(async () => structuredClone(s[i++]!), profile)
    }
    expect(await fingerprint(a)).not.toBe(await fingerprint(b))
    expect(await fingerprint(a, LOGICAL_SCHEMA_PROFILE)).toBe(
      await fingerprint(b, LOGICAL_SCHEMA_PROFILE),
    )
  })
  it.each([
    'order',
    'enum-order',
    'type',
    'nullability',
    'ACL',
    'owner',
    'policy',
    'default-privileges',
    'dependency',
  ])('retains %s drift', (kind) => {
    const a = fixture(),
      b = fixture()
    if (kind === 'order') b[3]![0]!.attnum = 5
    if (kind === 'enum-order') b[10]![0]!.enumsortorder = 3
    if (kind === 'type') b[3]![0]!.type = 'integer'
    if (kind === 'nullability') b[3]![0]!.attnotnull = false
    if (kind === 'ACL') b[3]![0]!.acl = '{public=r}'
    if (kind === 'owner') b[10]![0]!.owner = 'other'
    if (kind === 'policy') b[8] = [{ policyname: 'allow-all', qual: 'true' }]
    if (kind === 'default-privileges') b[13] = [{ acl: 'PUBLIC=arwdDxt' }]
    if (kind === 'dependency') b[4] = [{ definition: 'FOREIGN KEY (a) REFERENCES other(a)' }]
    expect(canonical(logicalCatalog(a))).not.toBe(canonical(logicalCatalog(b)))
  })
  it.each([
    'coverage',
    'duplicate-name',
    'duplicate-position',
    'unknown-field',
    'NaN',
    'mixed-type',
  ])('rejects malformed %s', (kind) => {
    const a = fixture()
    if (kind === 'coverage') a.pop()
    if (kind === 'duplicate-name') a[3]![1]!.attname = 'a'
    if (kind === 'duplicate-position') a[3]![1]!.attnum = 1
    if (kind === 'unknown-field') a[3]![1]!.unexpected = true
    if (kind === 'NaN') a[10]![0]!.enumsortorder = NaN
    if (kind === 'mixed-type') a[10]!.push({ ...a[10]![0], enumlabel: null, enumsortorder: null })
    expect(() => logicalCatalog(a)).toThrow()
  })
})

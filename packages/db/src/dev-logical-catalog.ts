/** Schema-only profile. Not the older Python 21-document (ledger+schema) digest.
 * Preserve every field; rank only surviving-column and enum positions. */
export const LOGICAL_SCHEMA_PROFILE = 'pg16-logical-schema-v1' as const
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'null'
}
export function logicalCatalog(sections: Record<string, unknown>[][]) {
  if (sections.length !== 19) throw new Error('Logical catalog coverage rejected')
  const result = structuredClone(sections)
  const name = (v: unknown) => typeof v === 'string' && v.length > 0 && !v.includes('\0')
  for (const [index, groupFields, label, position, fields] of [
    [
      3,
      ['nspname', 'relname'],
      'attname',
      'attnum',
      [
        'nspname',
        'relname',
        'attname',
        'attnum',
        'type',
        'attnotnull',
        'attidentity',
        'attgenerated',
        'attstorage',
        'attcompression',
        'collation',
        'acl',
        'expression',
      ],
    ],
    [
      10,
      ['nspname', 'typname'],
      'enumlabel',
      'enumsortorder',
      ['nspname', 'typname', 'typtype', 'owner', 'acl', 'enumlabel', 'enumsortorder'],
    ],
  ] as const) {
    const groups = new Map<string, Record<string, unknown>[]>()
    for (const row of result[index]!) {
      if (
        canonical(Object.keys(row).sort()) !== canonical([...fields].sort()) ||
        !groupFields.every((k) => name(row[k]))
      )
        throw new Error('Logical catalog fields rejected')
      const group = canonical(groupFields.map((k) => row[k]))
      const members = groups.get(group) ?? []
      members.push(row)
      groups.set(group, members)
    }
    for (const rows of groups.values()) {
      if (index === 10 && rows.some((r) => r[label] === null)) {
        if (rows.length !== 1 || rows[0]![position] !== null)
          throw new Error('Logical type identity rejected')
        continue
      }
      if (
        new Set(rows.map((r) => r[label])).size !== rows.length ||
        new Set(rows.map((r) => r[position])).size !== rows.length
      )
        throw new Error('Logical catalog duplicate rejected')
      for (const row of rows) {
        const number = row[position]
        if (
          !name(row[label]) ||
          typeof number !== 'number' ||
          !Number.isFinite(number) ||
          (index === 3
            ? !Number.isInteger(number) || number < 1 || number > 32767
            : row.typtype !== 'e')
        )
          throw new Error('Logical catalog position rejected')
      }
      rows.sort((a, b) => (a[position] as number) - (b[position] as number))
      rows.forEach((row, i) => {
        row[position] = i + 1
      })
    }
  }
  return result.map((rows) => rows.map(canonical).sort())
}

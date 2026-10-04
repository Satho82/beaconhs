import { describe, expect, it } from 'vitest'
import { parseImportRows, validateImportRows } from './engine'
import {
  createPeopleImportDataset,
  peopleImportDataset,
  peopleTemplateCsv,
  validatePeopleReferences,
} from './people'
describe('People import contract', () => {
  it('validates canonical rows without writes', async () => {
    const rows = parseImportRows(
      `${peopleTemplateCsv()}E1,Ada,Lovelace,ada@example.com,,,active,,,,\n`,
      peopleImportDataset,
    )
    expect((await validateImportRows(rows, peopleImportDataset))[0]?.issues).toEqual([])
  })
  it('retains invalid rows and rejects unknown tenant references', () => {
    const row = peopleImportDataset.map({
      first_name: '',
      last_name: 'L',
      email: 'bad',
      property_code: 'x',
    })
    expect(
      [
        ...peopleImportDataset.validate(row),
        ...validatePeopleReferences(row, {
          departments: new Set(),
          trades: new Set(),
          crews: new Set(),
          jobTitles: new Set(),
          properties: new Set(),
          existingEmployeeNos: new Map(),
          existingEmails: new Map(),
        }),
      ].map((x) => x.severity),
    ).toEqual(['error', 'error', 'error'])
  })

  it('classifies existing tenant contact identities as reviewable skips', async () => {
    const dataset = createPeopleImportDataset({
      departments: new Set(['operations']),
      trades: new Set(),
      crews: new Set(),
      jobTitles: new Set(),
      properties: new Set(),
      existingEmployeeNos: new Map([['e1', 'person-employee']]),
      existingEmails: new Map([['ada@example.com', 'person-email']]),
    })
    const rows = parseImportRows(
      `${peopleTemplateCsv()}E1,Ada,Lovelace,ada@example.com,,,active,Operations,,,\n`,
      dataset,
    )
    const [row] = await validateImportRows(rows, dataset)
    expect(row).toMatchObject({
      duplicateReference: 'person-employee',
      proposedAction: 'skip',
      issues: [{ severity: 'warning', message: 'Existing record matched.' }],
    })
  })

  it('keeps blank rows invalid and import rows free of authentication fields', () => {
    const blank = peopleImportDataset.map({})
    expect(peopleImportDataset.validate(blank).map((issue) => issue.message)).toEqual([
      'First name is required.',
      'Last name is required.',
    ])
    expect(Object.keys(blank)).not.toContain('user_id')
    expect(Object.keys(blank)).not.toContain('password')
  })

  it('accepts multiple independently authorised property references during validation', () => {
    const row = peopleImportDataset.map({ property_code: ' HOTEL-A ' })
    expect(
      validatePeopleReferences(row, {
        departments: new Set(),
        trades: new Set(),
        crews: new Set(),
        jobTitles: new Set(),
        properties: new Set(['hotel-a', 'hotel-b']),
        existingEmployeeNos: new Map(),
        existingEmails: new Map(),
      }),
    ).toEqual([])
  })

  it('rejects unknown job title, trade, and crew references', () => {
    const row = peopleImportDataset.map({ job_title: 'Manager', trade: 'Electrical', crew: 'A' })
    expect(
      validatePeopleReferences(row, {
        departments: new Set(),
        trades: new Set(),
        crews: new Set(),
        jobTitles: new Set(),
        properties: new Set(),
        existingEmployeeNos: new Map(),
        existingEmails: new Map(),
      }).map((issue) => issue.message),
    ).toEqual([
      'Trade reference is unknown.',
      'Crew reference is unknown.',
      'Job title reference is unknown.',
    ])
  })
})

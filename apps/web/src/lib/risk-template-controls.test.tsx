// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdoptionPanel } from '@/app/(app)/hospitality/risk/templates/[templateId]/adoption-panel'
import { SaveTenantTemplate } from '@/app/(app)/hospitality/risk/save-tenant-template'

const mocks = vi.hoisted(() => ({ push: vi.fn(), adopt: vi.fn(), save: vi.fn(), error: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/i18n/generated', () => ({
  useGeneratedValueTranslations: () => (value: string) => value,
}))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: mocks.error } }))
vi.mock('@/app/(app)/hospitality/risk/actions', () => ({
  adoptRiskAssessmentAction: mocks.adopt,
  saveTenantRiskTemplateAction: mocks.save,
}))
let host: HTMLDivElement
let root: Root
const props = {
  templateId: 'source-template',
  templateTitle: 'Synthetic template',
  activePropertyId: 'property-a',
  properties: [{ id: 'property-a', name: 'Synthetic Hotel A' }],
  canAdopt: true,
  active: true,
}
function button(label: string) {
  const result = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  )
  if (!result) throw new Error(`Button not found: ${label}`)
  return result
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.adopt.mockResolvedValue({ assessmentId: 'new-assessment' })
  mocks.save.mockResolvedValue({ templateId: 'new-template' })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('Risk template controls', () => {
  it.each([
    ['Use Template', ''],
    ['Amend', '#assessment-editor'],
  ])('makes %s create a property-owned copy before navigation', async (label, hash) => {
    await act(() => root.render(<AdoptionPanel {...props} />))
    await act(async () => button(label!).click())
    expect(mocks.adopt).toHaveBeenCalledWith({
      templateId: 'source-template',
      propertyId: 'property-a',
      title: 'Synthetic template',
    })
    expect(mocks.push).toHaveBeenCalledWith(`/hospitality/risk/assessments/new-assessment${hash}`)
  })
  it.each([{ canAdopt: false }, { active: false }])(
    'does not offer adoption for an unavailable operation: %j',
    async (override) => {
      await act(() => root.render(<AdoptionPanel {...props} {...override} />))
      expect(host.querySelectorAll('button')).toHaveLength(0)
      expect(mocks.adopt).not.toHaveBeenCalled()
    },
  )
  it('does not navigate or claim success if adoption fails', async () => {
    mocks.adopt.mockRejectedValueOnce(new Error('Denied'))
    await act(() => root.render(<AdoptionPanel {...props} />))
    await act(async () => button('Amend').click())
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalled()
  })
  it('saves a tenant template through the shared drawer using the selected source', async () => {
    await act(() =>
      root.render(
        <SaveTenantTemplate
          source={{ kind: 'assessment', id: 'assessment-a' }}
          title="Reusable guidance"
          description="Synthetic description"
        />,
      ),
    )
    await act(() => button('Save as Tenant Template').click())
    const drawer = document.querySelector('[role="dialog"]')!
    expect(drawer.textContent).toContain('last saved assessment content')
    await act(async () =>
      drawer
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    )
    expect(mocks.save).toHaveBeenCalledWith({
      source: { kind: 'assessment', id: 'assessment-a' },
      title: 'Reusable guidance',
      description: 'Synthetic description',
    })
    expect(mocks.push).toHaveBeenCalledWith('/hospitality/risk/templates/new-template')
  })
  it('keeps a failed template copy open and displays an error without navigating', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Conflict'))
    await act(() =>
      root.render(
        <SaveTenantTemplate
          source={{ kind: 'template', id: 'master' }}
          title="Duplicate"
          description="Synthetic description"
        />,
      ),
    )
    await act(() => button('Save as Tenant Template').click())
    await act(async () =>
      document
        .querySelector('[role="dialog"] form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    )
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('could not be saved')
    expect(mocks.push).not.toHaveBeenCalled()
  })
})

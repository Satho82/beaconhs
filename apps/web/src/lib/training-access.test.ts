import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@beaconhs/tenant'

const mocks = vi.hoisted(() => ({
  ctx: { isSuperAdmin: false, permissions: new Set<string>(), db: vi.fn() },
}))
vi.mock('@/lib/auth', () => ({
  requireRequestContext: async () => mocks.ctx,
  getRequestContext: async () => mocks.ctx,
}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedTranslations: async () => (key: string) => key,
  getGeneratedValueTranslations: async () => (value: string) => value,
}))

import TrainingIndexPage from '../app/(app)/training/page'
import { ModuleNav } from '@/components/module-admin/module-nav'
import { can } from '@beaconhs/tenant'
import { TRAINING_TAB_PERMISSIONS } from './training-access'

beforeEach(() => {
  mocks.ctx.isSuperAdmin = false
  mocks.ctx.permissions = new Set()
  mocks.ctx.db.mockReset()
})

describe('Training navigation uses the list permission gates', () => {
  it.each([
    [[], '/training/courses', ['courses', 'classes']],
    [
      ['training.read.self'],
      '/training/records',
      ['records', 'skills', 'courses', 'classes', 'assessments'],
    ],
    [
      ['training.read.all'],
      '/training/records',
      ['records', 'skills', 'courses', 'classes', 'assessments'],
    ],
    [['training.course.manage'], '/training/courses', ['skills', 'courses', 'classes']],
    [['training.record.create'], '/training/courses', ['courses', 'classes', 'assessments']],
    [['training.class.manage'], '/training/courses', ['courses', 'classes', 'assessments']],
    [
      ['training.*'],
      '/training/records',
      ['records', 'skills', 'courses', 'classes', 'assessments'],
    ],
  ])(
    'routes permissions %j to %s and hides inaccessible tabs',
    async (permissions, target, tabs) => {
      mocks.ctx.permissions = new Set(permissions)
      await expect(TrainingIndexPage()).rejects.toThrow(`redirect:${target}`)
      const nav = await ModuleNav({ moduleKey: 'training', active: 'courses' })
      expect(nav?.props.tabs.map((tab: { key: string }) => tab.key)).toEqual(tabs)
      for (const [key, gate] of Object.entries(TRAINING_TAB_PERMISSIONS)) {
        expect(tabs.includes(key)).toBe(
          gate.some((p) => can(mocks.ctx as unknown as RequestContext, p)),
        )
      }
      expect(mocks.ctx.db).not.toHaveBeenCalled()
    },
  )

  it('allows Super Admin without assigning role permissions', async () => {
    mocks.ctx.isSuperAdmin = true
    await expect(TrainingIndexPage()).rejects.toThrow('redirect:/training/records')
    const nav = await ModuleNav({ moduleKey: 'training', active: 'records' })
    expect(nav?.props.tabs).toHaveLength(5)
  })
})

describe('restricted Training list deep links', () => {
  it.each(['records', 'skills', 'assessments'] as const)(
    'redirects %s before querying tenant records',
    async (list) => {
      const pages = {
        records: () => import('../app/(app)/training/records/page'),
        skills: () => import('../app/(app)/training/skills/page'),
        assessments: () => import('../app/(app)/training/assessments/page'),
      }
      const { default: page } = await pages[list]()
      await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        'redirect:/training/courses',
      )
      expect(mocks.ctx.db).not.toHaveBeenCalled()
    },
  )
})

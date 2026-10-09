import { isNavModuleEntitled } from './entitlements'
import { approvedNavigation } from './approved-structure'
// Server-side nav resolver.
//
// Turns the code-defined module registry + a tenant's saved overrides
// (tenant_nav_config) into the concrete SidebarNavGroup[] the client nav
// components render. Responsibilities:
//   - load the saved config, or compute defaults (registry + Toolbox Talk pin)
//   - resolve pinned-form items to their template name / icon / home href
//   - filter every item by its module permission gates — the sidebar now reflects
//     what each user may actually open
//   - drop `hidden` items and empty groups
//
// Read-only: never writes. A tenant gets a persisted row only when an admin
// saves in /admin/navigation; until then everyone sees the computed defaults.

import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import { can, type RequestContext } from '@beaconhs/tenant'
import type { Database } from '@beaconhs/db'
import {
  formTemplates,
  tenantNavConfigs,
  tenantModuleEntitlements,
  type NavItemConfig,
  type TenantNavConfig,
} from '@beaconhs/db/schema'
import type { SidebarNavGroup, SidebarNavItem } from '@/components/sidebar-nav'
import {
  buildDefaultNavConfig,
  defaultNavGroupMessageKey,
  defaultNavModuleMessageKey,
  moduleByKey,
  PINNED_FORM_DEFAULT_ICON,
  withMissingModules,
} from './registry'
import { effectiveModuleKeys } from '@/lib/module-entitlements/policy'
import type { ModuleKey } from '@/lib/module-entitlements/catalogue'
import { getEffectiveRoleKeys } from '@/lib/effective-roles'
import { templateAccessWhere } from '@/app/(app)/apps/_lib/access'

// Stable per-tenant slug of the built-in lift-plan form template (see
// packages/db/src/seed/lift-plan-template.ts). Kept local to avoid a deep
// package subpath import.
const LIFT_PLAN_TEMPLATE_KEY = 'lift-plan'
const TOOLBOX_TEMPLATE_KEY = 'toolbox-talk'

// A pinned form is visible to anyone who can interact with form responses at
// all. Workers have forms.response.create / read.self; reviewers/admins have
// template.read. Super-admin short-circuits inside can().
function canSeePinnedForm(ctx: RequestContext): boolean {
  return (
    can(ctx, 'forms.response.create') ||
    can(ctx, 'forms.response.read.self') ||
    can(ctx, 'forms.response.read.site') ||
    can(ctx, 'forms.response.read.all') ||
    can(ctx, 'forms.template.read')
  )
}

/**
 * The raw, editable nav config for the current tenant: the saved row if one
 * exists, else the computed defaults (registry modules + an auto-pinned
 * Toolbox Talk form). Shared by the renderer (resolveNavGroups) and the
 * /admin/navigation editor so both agree on what "defaults" means.
 */
export async function loadNavConfig(tx: Database): Promise<TenantNavConfig> {
  const [row] = await tx.select().from(tenantNavConfigs).limit(1)
  // Saved configs predate any module shipped after they were saved — layer
  // missing registry modules into their default groups so new built-ins appear.
  if (row?.config) return withMissingModules(row.config)

  // Keep Toolbox Talk accessible. Lift Plan remains stored but is excluded
  // from the board navigation, including saved pins.
  const config = buildDefaultNavConfig()
  const builtIns = await tx
    .select({ id: formTemplates.id, key: formTemplates.key })
    .from(formTemplates)
    .where(
      and(
        inArray(formTemplates.key, [TOOLBOX_TEMPLATE_KEY]),
        eq(formTemplates.status, 'published'),
        isNull(formTemplates.deletedAt),
      ),
    )
  const frontline = config.groups.find((g) => g.id === 'frontline')
  const toolbox = builtIns.find((t) => t.key === TOOLBOX_TEMPLATE_KEY)
  if (toolbox) {
    frontline?.items.push({
      kind: 'form',
      templateId: toolbox.id,
      label: 'Toolbox talks',
      iconKey: 'message',
    })
  }
  return config
}

export async function resolveNavGroups(
  ctx: RequestContext,
  tx: Database,
  activePropertyId?: string | null,
): Promise<SidebarNavGroup[]> {
  const config = await loadNavConfig(tx)
  const effectiveRoleKeys = await getEffectiveRoleKeys(ctx, tx)
  const now = new Date()
  const entitlementRows = await tx
    .select({
      moduleKey: tenantModuleEntitlements.moduleKey,
      state: tenantModuleEntitlements.state,
      effectiveFrom: tenantModuleEntitlements.effectiveFrom,
      effectiveUntil: tenantModuleEntitlements.effectiveUntil,
    })
    .from(tenantModuleEntitlements)
    .where(
      and(
        eq(tenantModuleEntitlements.tenantId, ctx.tenantId),
        eq(tenantModuleEntitlements.state, 'enabled'),
        or(
          isNull(tenantModuleEntitlements.effectiveFrom),
          lte(tenantModuleEntitlements.effectiveFrom, now),
        ),
        or(
          isNull(tenantModuleEntitlements.effectiveUntil),
          gt(tenantModuleEntitlements.effectiveUntil, now),
        ),
      ),
    )
  const entitledModules = effectiveModuleKeys(entitlementRows.map((row) => row.moduleKey))

  // Batch-resolve pinned form templates → name / icon.
  const formIds = [
    ...new Set(
      config.groups
        .flatMap((g) => g.items)
        .filter((i): i is Extract<NavItemConfig, { kind: 'form' }> => i.kind === 'form')
        .map((i) => i.templateId),
    ),
  ]
  const formMeta = new Map<string, { name: string; iconKey: string | null; key: string | null }>()
  if (formIds.length > 0) {
    const rows = await tx
      .select({
        id: formTemplates.id,
        name: formTemplates.name,
        iconKey: formTemplates.iconKey,
        key: formTemplates.key,
      })
      .from(formTemplates)
      .where(
        and(
          inArray(formTemplates.id, formIds),
          templateAccessWhere(ctx, effectiveRoleKeys, 'operate'),
        ),
      )
    for (const r of rows) formMeta.set(r.id, { name: r.name, iconKey: r.iconKey, key: r.key })
  }

  // 3. Map → SidebarNavGroup[], filtering hidden + permission + dangling refs.
  const groups: SidebarNavGroup[] = []
  for (const g of config.groups) {
    const items: SidebarNavItem[] = []
    for (const item of g.items) {
      if (item.hidden) continue
      const resolved = resolveItem(item, ctx, formMeta, entitledModules)
      if (resolved) items.push(resolved)
    }
    if (items.length > 0) {
      groups.push({
        label: g.label,
        labelKey: defaultNavGroupMessageKey(g.id, g.label),
        items,
      })
    }
  }
  return approvedNavigation(
    groups,
    (permission) => can(ctx, permission),
    entitledModules,
    activePropertyId,
  )
}

function resolveItem(
  item: NavItemConfig,
  ctx: RequestContext,
  formMeta: Map<string, { name: string; iconKey: string | null; key: string | null }>,
  entitledModules: Set<ModuleKey>,
): SidebarNavItem | null {
  if (item.kind === 'module') {
    const mod = moduleByKey(item.moduleKey)
    if (!mod || mod.boardHidden) return null // stale/removed module key
    if (!isNavModuleEntitled(mod.key, entitledModules)) return null
    if (mod.requiredPermission && !can(ctx, mod.requiredPermission)) return null
    if (mod.requiredAnyPermission?.length && !mod.requiredAnyPermission.some((p) => can(ctx, p))) {
      return null
    }
    return {
      href: mod.href,
      label: item.label ?? mod.label,
      labelKey: item.label ? undefined : defaultNavModuleMessageKey(mod.key),
      iconKey: item.iconKey ?? mod.iconKey,
    }
  }
  if (item.kind === 'form') {
    const meta = formMeta.get(item.templateId)
    if (!meta || meta.key === LIFT_PLAN_TEMPLATE_KEY) return null // template deleted
    if (!canSeePinnedForm(ctx)) return null
    return {
      // A pinned app behaves like a native module: land on its list of entries
      // (records), not the designer. Rows open the entry; editors get a
      // "Configure" link from there into the builder.
      href: `/apps/templates/${item.templateId}/records`,
      approvedParent: meta.key === TOOLBOX_TEMPLATE_KEY ? 'Training' : 'Diary & Tasks',
      label: item.label ?? meta.name,
      iconKey: item.iconKey ?? meta.iconKey ?? PINNED_FORM_DEFAULT_ICON,
    }
  }
  // link
  return {
    href: item.href,
    label: item.label,
    iconKey: item.iconKey ?? 'link',
  }
}

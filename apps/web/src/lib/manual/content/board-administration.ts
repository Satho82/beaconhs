import type { ManualArticle } from '../types'
export const BOARD_ADMINISTRATION_ARTICLES: ManualArticle[] = [
  {
    slug: 'tenant-settings',
    title: 'Tenant Settings',
    group: 'Administration',
    iconKey: 'settings',
    requiredPermission: 'admin.settings.manage',
    summary: 'Manage the selected tenant identity, regional settings and branding.',
    keywords: ['tenant', 'branding', 'settings', 'notifications', 'integrations'],
    body: `Open [Tenant Settings](/admin/settings) under Administration. The selected tenant is named on the page; changes apply only to that tenant.

## General
Set tenant identity, locale, timezone, currency, date and number formats, languages and regulatory terminology. Edit a value to enable **Save** and **Discard**. Discard restores the saved form. If saving fails, check the displayed message and keep your edits until you can save successfully.

## Branding
Open [Branding](/admin/settings/branding) for the tenant logo, supported accent and PDF letterhead. Logo uploads accept PNG, JPEG or WebP up to 2 MB; letterheads accept PDF up to 5 MB. These controls cannot change the master Uvanoo name, logo, favicon or browser-title template.

## Notifications and Integrations
These tabs open the existing dedicated administration pages. Their own permissions continue to apply. Advanced is no longer a primary settings tab.

## Platform administration
Platform operators use the separate Platform administration area to manage master branding, tenant lifecycle and module configuration. Tenant admins cannot activate licensed modules. Platform Overview shows real counts, not service-health or financial claims.`,
  },
  {
    slug: 'property-board-journey',
    title: 'Properties and structure',
    group: 'Administration',
    iconKey: 'building',
    requiredPermission: 'hospitality.read',
    summary: 'Browse properties, buildings, floors and rooms without changing existing records.',
    keywords: ['properties', 'structure', 'buildings', 'floors', 'rooms', 'import'],
    body: `Open [Properties](/hospitality/properties). Availability still depends on tenant entitlement, role permissions and property scope.

## Property sections
**Overview** identifies the property. **Structure** searches and pages through buildings; open a building for floors and then rooms. **Operations** links to the enabled Diary and Manager Sign-off pages. **Settings** exposes existing property-management actions only to authorised managers.

## Import discovery
Authorised administrators can choose **Import property structure** from the property list or Structure. The importer is tenant-wide, not limited to the property currently being viewed. Its existing upload, validation, preview, review, confirmation and audit stages remain in place.

## Navigation
The board navigation uses Properties as the physical structure. Legacy Locations remains available for existing compatibility. Lift Plan, PPE and Tools are not primary navigation entries; their data is retained. Toolbox Talk remains accessible in Resources when its published template and permissions allow it.`,
  },
]

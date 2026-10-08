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
    body: `Open [Tenant Settings](/admin/settings) in the expandable application menu. The selected tenant is named on the page; changes apply only to that tenant.

## General
Set tenant identity, locale, timezone, currency, date and number formats, languages and regulatory terminology. Edit a value to enable **Save** and **Discard**. Discard restores the saved form. If saving fails, check the displayed message and keep your edits until you can save successfully.

## Branding
Open [Branding](/admin/settings/branding) for the tenant logo, primary colour and PDF letterhead. Logo uploads accept PNG, JPEG or WebP up to 2 MB; letterheads accept PDF up to 5 MB. The tenant logo and primary colour apply to the tenant application shell. Platform defaults remain in place when an override is removed. Use Desktop or Mobile in Live Preview to inspect changes before saving. **Copy colour** copies the current valid HEX value. **Reset to Platform Default** in the colour section clears only the colour override. **Reset to Default** at the bottom removes both the tenant logo and colour overrides; it leaves the PDF letterhead unchanged. Choosing a valid replacement logo after a reset cancels logo removal. Save to apply these changes, or Discard to restore the saved identity.

## Notifications and Integrations
These tabs open the existing dedicated administration pages. Their own permissions continue to apply. Advanced is a separate tab for regulatory terminology. Save and Discard work independently of General.

## Modules and access
Open [Modules](/admin/settings/modules) to see effective module access. **Navigation preferences** only changes the menu. **Roles & permissions** controls permitted actions. **Users & property assignments** controls property access. Each link is shown only when your permissions allow it. Tenant administrators cannot change platform entitlements.

## Import / Export
[Import / Export](/admin/settings/import-export) supports the Property Structure CSV workflow: Upload, Preview, Review, Import and Result. Choose a file or drop it onto the upload area. The selected file shows its byte size and can be removed. Preview supports row search, record-type filters and pagination. The limit is 5 MB. XLSX and partial imports are not supported. Confirm only after validation succeeds. No records are imported merely by previewing a file.

## Platform administration
Platform operators use the separate Platform administration area to manage master branding, tenant lifecycle and module configuration. Tenant admins cannot activate licensed modules. Platform Overview shows real counts, not service-health or financial claims.

## If notification settings cannot load
The page keeps the selected tenant visible and shows **Retry**. Settings cannot be edited until configuration loads successfully. A failed lookup does not mean there are no settings or that email or SMS is unconfigured. Choose **Retry** to reload the current page; if the problem continues, contact your administrator.

## Review the tenant portfolio
Platform operators open **Tenants**, search by name, slug or region, and filter by Active, Suspended or Archived. The result count and pagination follow the filters. **Open** is available in every lifecycle state; entering a tenant workspace is available only for active tenants. On a phone, each card shows status, property count and effective module count.

## Master branding and modules
Open **Global Settings → General Settings** to edit the platform name and default primary colour. Other branding and analytics settings are preserved. Regional defaults remain tenant settings. The Template seeding utility is a maintenance tool, not a Template Library.

In **Platform Branding**, upload the master logo or favicon and edit the supported platform identity. **Save branding** saves changes; **Discard** restores saved values. A failed save keeps edits available and displays a safe message. Tenant Branding remains separate.

For each tenant, **Modules** shows configured and effective states, the effective period, and the recorded last change. Manager Sign-off requires effective Diary access. Enabled counts use effective entitlements, including their effective dates and dependencies. **Overview**, **Branding**, **Properties** and **Activity** remain within Platform administration for the named tenant.`,
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

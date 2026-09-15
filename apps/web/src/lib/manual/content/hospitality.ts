import type { ManualArticle } from '../types'

export const HOSPITALITY_ARTICLES: ManualArticle[] = [
  {
    slug: 'hospitality-properties',
    title: 'Create and archive properties',
    group: 'Administration',
    iconKey: 'building',
    summary: 'Create a hotel property or archive it while retaining its records.',
    keywords: ['hospitality', 'property', 'hotel', 'create', 'archive'],
    requiredPermission: 'hospitality.manage',
    body: `
# Create and archive properties

Your organisation must have the properties module enabled and you need hospitality management permission.

1. Open **Properties**, then **Add property**.
2. Enter **Property name**, **Property code**, and **Timezone**. Use an IANA timezone such as Europe/London.
3. Choose **Create property**. The new property opens so you can add its buildings, floors, and rooms.
4. To archive a property, open its page and find **Property management**.
5. Choose **Archive property**, then confirm the dialog. Cancel the dialog to keep the property active.

Use the search box to find properties or buildings by name or code. Use the page controls to browse longer lists. If a search shows **No results**, clear the search using the × button. Changing or clearing a search returns to the first page. If a page is no longer available, use the page link to return to the last available page.

Open a building and then a floor to browse its rooms and apartments. Search by room number/code, name, or type (for example, apartment). Choose **Status** to filter the list; choose **All** to clear that filter. Search and status filters work together. Use the page controls for longer lists. Each entry shows its code, optional name, type, and current status. Open an entry to view or manage the room. Changing a search or status filter returns to the first page.

Archived properties disappear from active property lists. Existing records are retained. Their building, floor, and room pages are no longer available. You cannot add or edit a building, floor, or room beneath an archived parent. Creating a property, building, floor, or room records an audit entry. These pages manage properties in your current organisation only.
`,
  },
  {
    slug: 'hospitality-manager-signoff',
    title: 'Manager sign-off',
    group: 'Oversight & reports',
    iconKey: 'clipboard-check',
    summary: 'Review a property’s weekly or monthly diary totals and record a manager sign-off.',
    keywords: ['hospitality', 'property', 'diary', 'manager', 'sign-off', 'weekly', 'monthly'],
    requiredPermission: 'hospitality.read',
    body: `
# Manager sign-off

Manager sign-off is available when your organisation has the operational diary enabled.

1. Open **Properties** and choose a property.
2. Choose **Manager sign-off** on the property page or its **Diary** page.
3. Choose **Weekly** or **Monthly** to review the current period. Period boundaries currently use UTC.
4. Review the completed, incomplete, overdue, and escalated task totals. Open **Back to diary** to investigate tasks before signing.
5. If you have hospitality management permission, enter **Manager comments** and choose **Confirm immutable weekly sign-off** or **Confirm immutable monthly sign-off**.
6. Check **Sign-off history** for recorded periods and signing times.

Each property period can be signed once. A sign-off records the summary at confirmation; it does not complete outstanding tasks. Signed records cannot be edited through this page.
`,
  },
]

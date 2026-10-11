import type { ManualArticle } from '../types'

export const HOSPITALITY_ARTICLES: ManualArticle[] = [
  {
    slug: 'hospitality-risk-review-schedule',
    title: 'Review Risk Assessments',
    group: 'Everyday tasks',
    iconKey: 'clipboard-check',
    summary: 'Find overdue and upcoming reviews, assign owners and record signed reviews.',
    keywords: ['risk', 'review schedule', 'overdue', 'next review', 'sign-off'],
    requiredPermission: 'hospitality.read',
    body: `
# Review Risk Assessments

1. Open **Risk → Review Schedule**. The summary cards show overdue reviews, reviews due in 30 days, reviews due in 31–90 days and recently reviewed assessments.
2. Choose a property, category, status or review period. Search by assessment reference or title and use the page controls to find a record.
   Choose **Schedule Review** to find an assessment and continue to its review and sign-off form. Summary cards also filter the register.
3. Choose **Review** to open the assessment. Check the hazards, people at risk and controls, then use **Review and sign-off** to record the effective date, review period and comments.
4. Choose **Record immutable sign-off**. The signed snapshot and audit history remain available on the assessment.
5. To assign a responsible person, choose **Edit / assign** and save the assessment.

The schedule shows assessments for properties you are authorised to access. Review completion does not create a diary task automatically. Use the property's Diary & Tasks page for operational tasks.
`,
  },
  {
    slug: 'hospitality-risk-editing',
    title: 'Edit a property risk assessment',
    group: 'Everyday tasks',
    iconKey: 'clipboard-check',
    summary: 'Amend assessment hazards and controls while retaining corrective-action history.',
    keywords: ['risk', 'assessment', 'hazard', 'controls', 'corrective action'],
    requiredPermission: 'hospitality.read',
    body: `
# Edit a property risk assessment

You need hospitality management permission to save changes, and access to the assessment's property. Creating a corrective action also requires corrective-action creation permission.

1. Open **Risk**, choose **Property Risk Assessments**, and select the property. Search by reference or title, filter the register and use the page controls to find an assessment.
2. Open the assessment, or choose its **Edit** link.
3. Edit the assessment details, hazards, people at risk and controls.
4. Choose **Add hazard** to add a hazard. You can use **Remove** on an unsaved addition.
5. Choose **Save assessment**. Wait for confirmation before continuing.
6. To create an action for saved further controls, choose **Create corrective action**.

Saved hazards retain their permanent identity and corrective-action links. Enter a **Reason for change**, then choose **Archive** or **Restore** in the content revision panel. These actions preserve earlier revisions and return the assessment to draft for a new sign-off. Editing a hazard does not change the owner, due date or status of an existing corrective action.

If another editor has changed the assessment since you opened it, a stale save or sign-off is rejected. Reload and review the latest revision before applying changes. Each successful content change creates an immutable revision in the same transaction; failed saves do not partially apply. Historical sign-offs remain linked to the exact approved revision.

## Create from scratch

Choose **Create from scratch**, select an authorised property and category, enter a title, and choose **Create draft**. This assessment has no source template. The current matrix is captured at creation. Add hazards and controls, save, and review before signing off.

## Use or amend a template

Open **Risk → Available Templates**. Search by approved RA reference, title or keyword, filter by one of the six hospitality categories or by owner, and use the page controls. Uvanoo catalogue cards show applicability and guidance version; tenant-created and previously installed templates remain available. Only installed templates appear: the page reports how many of the 50 approved topics are installed. Installation is an administrator operation, never a page action.

Choose **Preview**, **Adopt** or **Adopt & Amend** to open the existing template details. The latter links take you to its adoption controls; they do not save anything until you confirm **Use Template** or **Amend**. Choose a property. **Use Template** creates a draft property assessment. **Amend** creates the same independent draft and opens its editor. Neither changes the source template. Review and save your changes before recording the assessment sign-off. Retired templates cannot be adopted.

## Save as a tenant template

Tenant-wide hospitality managers can choose **Save as Tenant Template** on a template or property assessment. Property-only managers cannot publish into the tenant-wide library.

1. Save assessment edits first, if copying an assessment.
2. Choose **Save as Tenant Template**.
3. Review the title and description, including any property-specific wording. Use a title that is not already used by a version 1.0 template in your tenant.
4. Confirm **Save as Tenant Template**. The new independent tenant draft opens.
5. Edit the title, description, category, hazards, controls and scores. Choose **Save draft**, then **Publish version** when reviewed.
6. To change a published tenant template, choose **Create next draft version**. Publishing it retires the previous active version in that family.

This copies active saved hazards, people at risk, controls and the captured matrix. Further controls become template guidance. Corrective-action records, assignments and sign-offs stay with their original assessment. Uvanoo templates are read-only. Drafts cannot be adopted, and publishing a new version never changes existing assessments.

Each new assessment keeps its own matrix snapshot. Changing tenant settings does not reinterpret its scores. If the historical matrix was not recorded, the assessment shows **Historical matrix unknown**. Enter a reason and choose **Use current matrix** before further editing or sign-off; earlier revisions remain unknown. A smaller matrix cannot be selected if existing scores use factors outside its range.
`,
  },
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

Your organisation must have the properties module enabled and you need hospitality management permission. Property access may be limited to one or several hotels by your administrator. Property lists, rooms, maintenance records, and changes are restricted to those assigned hotels. Only a management-company administrator with access to all properties can create a new property.

1. Open **Properties**, then **Add property**.
2. Enter **Property name**, **Property code**, and **Timezone**. Use an IANA timezone such as Europe/London.
3. Choose **Create property**. The new property opens so you can add its buildings, floors, and rooms.
4. To archive a property, open its page and find **Property management**.
5. Choose **Archive property**, then confirm the dialog. Cancel the dialog to keep the property active.

Use the search box to find properties or buildings by name or code. Use the page controls to browse longer lists. If a search shows **No results**, clear the search using the × button. Changing or clearing a search returns to the first page. If a page is no longer available, use the page link to return to the last available page.

Open a building and then a floor to browse its rooms and apartments. Search by room number/code, name, or type (for example, apartment). Choose **Status** to filter the list; choose **All** to clear that filter. Search and status filters work together. Use the page controls for longer lists. Each room appears in a separate card showing its code, optional name, type, and current status. Open an entry to view or manage the room. Changing a search or status filter returns to the first page.

Archived properties disappear from active property lists. Existing records are retained. Their building, floor, and room pages are no longer available. You cannot add or edit a building, floor, or room beneath an archived parent. Creating a property, building, floor, or room records an audit entry. These pages manage properties in your current organisation only.


## Browse the property structure

Open a property and choose **Structure**. Open a building, then a floor, then a room. The breadcrumbs return to each parent. Search floors by name or code and use the page controls for longer lists. Clear the search when no floors match.

Managers with settings permission can choose **Import property structure (tenant-wide)** from Structure. This opens the existing upload, validation, preview, review and confirmation workflow for the organisation; it is not restricted to the currently selected property. To archive a property, open **Settings**, then **Property management** and confirm **Archive property**.
`,
  },
  {
    slug: 'hospitality-maintenance',
    title: 'Guest room QR and maintenance',
    group: 'Everyday tasks',
    iconKey: 'wrench',
    summary: 'Create room QR codes and manage guest or staff maintenance reports.',
    keywords: ['hospitality', 'hotel', 'room', 'maintenance', 'guest', 'QR', 'repair'],
    requiredPermission: 'maintenance.read',
    body: `
# Guest room QR and maintenance

Your organisation must have the hospitality maintenance module enabled. When it is disabled, Maintenance queue is hidden from the menu and direct access is denied. Enabling it does not change your permissions or assigned hotel access.

## Create a room QR code

1. Open **Hospitality**, choose a property, then open its building, floor, and room.
2. Under **Guest maintenance QR**, choose **Create room QR**.
3. Choose **View and print QR** and print the Uvanoo room card.
4. Place that card in the matching room. The code is unique and already identifies the property and room.
5. If a code is copied or misused, choose **Rotate QR**. The old link stops working immediately.

Guests do not need a staff account. They scan the code, choose an issue type and urgency, describe the problem, and may share contact details with consent. Reports are rate-limited and duplicate submissions reuse the same reference.

## Report a problem from Front Office

1. Open **Maintenance queue** in the left menu, then choose **+ Report maintenance issue**.
2. If you work at one hotel, that property is selected automatically and its name appears above the room field. Portfolio users choose only from their assigned properties.
3. Choose the room or location, describe the problem, select a priority when needed, then submit.
4. The report enters the same maintenance queue used by guest QR and engineering reports. Front Office does not need to assign a contractor, create a work order, or enter resolution details.

## Work the maintenance queue

1. Open **Maintenance queue** in the left menu.
2. Search by reference, issue, room, or property. Use **Status** to filter the queue.
3. Open an issue to see its location, source, details, and any consented guest contact information.
4. Move the issue through **reported**, **acknowledged**, **assigned**, **in progress**, **awaiting parts**, **completed**, and **closed**.
5. An assigned issue needs an assignee. Completing or closing an issue requires resolution notes.
6. Completed issues can return to **in progress** when more work is needed. Closed issues cannot be reopened.

Room pages also show their maintenance history. All QR and maintenance actions remain within the current organisation and respect the customer module settings.


## Review an issue

The queue shows the active property context, or all accessible properties. Each issue card separates the reference and problem from the property and room. Priority and status appear as labelled badges; colour supplements the text. Open an issue to review **Status**, **Priority**, **Assigned to**, location and details. **Resolution and record history** shows saved resolution notes and reported, last-updated and completion timestamps where recorded. These timestamps are not a complete audit timeline. **Evidence** groups files by reported, before-work, after-work and completion stages. Readers can review the saved resolution; staff with update permission can use **Update work** and upload evidence.
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

Manager sign-off is available when your organisation has the manager sign-off module enabled. The operational diary module provides the task data reviewed in each period.

1. Open **Properties** and choose a property.
2. Choose **Manager sign-off** on the property page or its **Diary** page.
3. Choose **Weekly** or **Monthly** to review the current period. Period boundaries currently use UTC.
4. Review the completed, incomplete, overdue, and escalated task totals. Open **Back to diary** to investigate tasks before signing.
5. If you have hospitality management permission, enter **Manager comments** and choose **Confirm immutable weekly sign-off** or **Confirm immutable monthly sign-off**.
6. Check **Sign-off history** for recorded periods and signing times. History is filtered to the selected weekly or monthly view; use the page controls for older records.

Each property period can be signed once. A sign-off records the summary at confirmation; it does not complete outstanding tasks. Signed records cannot be edited through this page.
`,
  },
]

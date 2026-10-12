import type { ManualArticle } from '../types'

// Rendered only by the guarded preview guide, not advertised in the live manual.
export const APPROVALS_PREVIEW_ARTICLE: ManualArticle = {
  slug: 'approvals-preview',
  title: 'Reviewing Approvals V1.4',
  group: 'Everyday tasks',
  iconKey: 'clipboard-check',
  summary: 'Review the isolated Approvals screens using clearly labelled synthetic records.',
  keywords: ['approvals', 'preview', 'request', 'decision'],
  requiredPermission: 'approvals.read',
  body: `
1. Use **Switch review account** to sign in as requester, manager, finance or configurator. These are synthetic review accounts, not DEV users.
2. As requester, open **Submit Request**. Enter a title, description and positive amount. Select a category, currency, authorised property and available **Approval workflow**. Choose **Submit Request** to start the selected one-stage or sequential workflow. Details are saved atomically as a synthetic audit snapshot alongside the isolated engine request, not as financial or source-module records. Failed submissions show feedback; an unchanged retry uses the same idempotency key.
3. Open **My Requests** or **Approval Inbox**. Search, filter by status or category, and use the page controls. Select a title to see **Approval Request Detail** and its **Timeline**.
4. Switch to manager. Open a pending request and choose **Open manager view**. Choose **Approve** or **Reject**, then **Submit Decision**. A rejection requires a reason. Only the assigned approver can decide; a requester cannot approve their own request.
5. For two-stage workflows, switch to finance to make the second decision. The timeline shows the actual recorded decisions. Finalised requests cannot be changed.
6. **Configurable Options** is read-only for Requester, Manager and Finance. The separate Configurator account can enter a workflow name, select one or two **Approval stages**, then choose **Create Workflow**. This creates a new version for future submissions; existing requests keep their original stages and decisions. Configurator cannot submit or decide requests. Configuration requires an explicit permission on the same property; an unscoped user override does not add property authority. **Permissions & Roles** shows actual synthetic roles; role editing remains in canonical administration, not Approvals.
7. **Reporting & Audit** shows counts from the bounded isolated fixture (up to 200 requests). Select a status to filter the Inbox. Open a request to see its immutable history.

Uploads, comments, cancellation, more-information requests, delegation, escalation, amount limits, exports and source-module processing are unavailable. Disabled controls do not simulate success. Other module tiles lead to an explanation, not live module workflows.

The preview uses the actual shared shell. The original approved dashboard remains the visual specification. Owner approval is required before integration. No preview action connects to DEV.`,
}

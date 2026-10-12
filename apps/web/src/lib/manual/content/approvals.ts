import type { ManualArticle } from '../types'
export const APPROVALS_ARTICLE: ManualArticle = {
  slug: 'approvals',
  title: 'Approval requests',
  group: 'Everyday tasks',
  iconKey: 'clipboard-check',
  summary:
    'Submit documented spending requests and review approvals within your property authority.',
  keywords: ['approvals', 'requests', 'spending', 'delegation'],
  requiredPermission: 'approvals.read',
  body: `
1. Open **Approvals** and **Create Request**. Choose the workflow for your property and category. Enter the title, positive amount, currency, supplier and description. Upload a PDF, JPG or PNG up to 10 MB. Choose **Submit Request**.
2. Use **My Requests** to follow your submissions. Search and filter by property or status. **Awaiting My Approval** shows pending requests assigned to you. **Team Requests** requires approval or configuration authority for the property.
3. Open a request to view its financial details, original stages, **Timeline**, **Documents** and **Comments**. Document downloads require your current access and are audited.
4. The current assigned approver can **Approve**, **Reject**, **Request More Information** or delegate to an eligible active colleague. Rejection and information requests require a reason. You cannot approve your own request. Refresh if another person has changed the request.
5. The requester can **Cancel Request** before it is finalised. When more information is requested, use **Submit More Information** to provide a response and return the request to the current approver. Financial details remain unchanged; cancel and submit a new request if those details are wrong.
6. **Send Reminder** notifies the requester and current approver. Manual reminders are limited to one per hour.
7. **Workflow Configuration** creates new workflows for future requests. Configure property, category, currency, maximum amount and sequential approvers. Existing request stages and decisions are never overwritten.
8. Use **Reporting & Exports** to search and filter requests and export CSV. Export also requires data-export permission. Narrow reports above 10,000 requests. Amounts in different currencies are kept separate.
`,
}

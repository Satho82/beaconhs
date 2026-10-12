// Explicitly synthetic review fixtures. Never imported by a production adapter.
export const PREVIEW_ROOT = '/preview/approvals'
export const PREVIEW_TENANT = 'a3300000-0000-4000-8000-000000000001'
export const PREVIEW_PROPERTY = 'a3300000-0000-4000-8000-000000000002'
export const PREVIEW_PEOPLE = {
  configurator: {
    id: 'a3300000-0000-4000-8000-000000000014',
    user: 'approvals-preview-configurator',
    name: 'Casey Wilson',
    email: 'approvals-configurator@example.invalid',
  },
  requester: {
    id: 'a3300000-0000-4000-8000-000000000011',
    user: 'approvals-preview-requester',
    name: 'Alex Morgan',
    email: 'approvals-requester@example.invalid',
  },
  manager: {
    id: 'a3300000-0000-4000-8000-000000000012',
    user: 'approvals-preview-manager',
    name: 'Jamie Patel',
    email: 'approvals-manager@example.invalid',
  },
  finance: {
    id: 'a3300000-0000-4000-8000-000000000013',
    user: 'approvals-preview-finance',
    name: 'Sam Taylor',
    email: 'approvals-finance@example.invalid',
  },
} as const
export const PREVIEW_SOURCES = [
  {
    id: 'a3300000-0000-4000-8000-000000000101',
    title: 'Invoice · ABC Supplies',
    category: 'Maintenance',
    amount: 125,
    supplier: 'ABC Supplies Ltd',
    description: 'Replacement door handle · Room 301',
  },
  {
    id: 'a3300000-0000-4000-8000-000000000102',
    title: 'Quote · Room 203 AC',
    category: 'Maintenance',
    amount: 850,
    supplier: 'Northstar Engineering',
    description: 'Review the air-conditioning repair quotation.',
  },
  {
    id: 'a3300000-0000-4000-8000-000000000103',
    title: 'Office supplies',
    category: 'General',
    amount: 45,
    supplier: 'Office Supply Co',
    description: 'Stationery for the reception team.',
  },
  {
    id: 'a3300000-0000-4000-8000-000000000104',
    title: 'Fire door repair',
    category: 'Maintenance',
    amount: 320,
    supplier: 'Northstar Engineering',
    description: 'Review supporting evidence before authorising the repair.',
  },
  {
    id: 'a3300000-0000-4000-8000-000000000105',
    title: 'Contractor call-out',
    category: 'Contractor',
    amount: 180,
    supplier: 'Hotel Services Ltd',
    description: 'One-off contractor attendance.',
  },
] as const
export const PREVIEW_SCREENS = [
  ['overview', 'Overview'],
  ['inbox', 'Approval Inbox'],
  ['submit', 'Submit Request'],
  ['my-requests', 'My Requests'],
  ['manager', 'Manager Approval View'],
  ['permissions', 'Permissions & Roles'],
  ['options', 'Configurable Options'],
  ['reporting', 'Reporting & Audit'],
] as const
export type PreviewScreen = (typeof PREVIEW_SCREENS)[number][0] | 'detail' | 'unavailable' | 'guide'

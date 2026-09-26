// Shared read gates for Training lists and their navigation tabs.
// Course/class catalogues remain available to signed-in tenant members.
const readPermissions = ['training.read.all', 'training.read.self'] as const

export const TRAINING_TAB_PERMISSIONS = {
  records: readPermissions,
  skills: [...readPermissions, 'training.course.manage'],
  assessments: [...readPermissions, 'training.record.create', 'training.class.manage'],
} as const

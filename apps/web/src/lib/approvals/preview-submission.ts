import { z } from 'zod'
import { PREVIEW_PROPERTY } from './preview-fixtures'

export const previewSubmission = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(300),
    description: z.string().trim().min(1, 'Description is required').max(4000),
    category: z.enum(['Maintenance', 'General', 'Contractor']),
    propertyId: z.literal(PREVIEW_PROPERTY),
    amount: z
      .number()
      .finite()
      .positive()
      .max(999999999)
      .refine(
        (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
        'Use at most two decimal places',
      ),
    currency: z.enum(['GBP', 'EUR', 'USD']),
    supplier: z.string().trim().max(200),
    workflowId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
export type PreviewSubmission = z.infer<typeof previewSubmission>

import { z } from 'zod'

export const moneyInput = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,2})?$/)
  .refine(
    (v) => /^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,2})?$/.test(v) && amountMinor(v) > 0n,
    'Amount must be positive',
  )
const currencyInput = z.enum(['GBP', 'EUR', 'USD'])
export const financialInput = z
  .object({
    workflowId: z.string().uuid(),
    title: z.string().trim().min(1).max(300),
    category: z.string().trim().min(1).max(100),
    amount: moneyInput,
    currency: currencyInput,
    supplier: z.string().trim().min(1).max(300),
    description: z.string().trim().max(10000),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
export const activityInput = z
  .object({
    requestId: z.string().uuid(),
    kind: z.enum(['comment', 'cancel', 'more_info', 'resubmit', 'delegate', 'remind']),
    body: z.string().trim().min(1).max(4000),
    targetId: z.string().uuid().optional(),
    stage: z.number().int().min(1).max(20),
    assignmentVersion: z.number().int().min(0),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine(
    (v) => (v.kind === 'delegate') === Boolean(v.targetId),
    'A delegate is required only for delegation',
  )
export const productionWorkflowInput = z
  .object({
    propertyId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(100),
    currency: currencyInput,
    maximumAmount: moneyInput,
    reminderHours: z.number().int().min(1).max(720),
    emailEnabled: z.boolean().default(false),
    inAppEnabled: z.boolean().default(true),
    stages: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200),
            approverId: z.string().uuid(),
            roleId: z.string().uuid(),
            maximumAmount: moneyInput,
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
export function amountMinor(value: string): bigint {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))
}
export function documentType(bytes: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-')
    return 'application/pdf'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'image/png'
  throw new Error('Upload a PDF, JPG or PNG document')
}

export const attachmentInput = z
  .object({ requestId: z.string().uuid(), idempotencyKey: z.string().uuid() })
  .strict()

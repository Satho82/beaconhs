import { z } from 'zod'

export const propertyInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(80),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((timezone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone })
        return true
      } catch {
        return false
      }
    }),
})

export type PropertyFormState = { error?: 'invalid_input' | 'create_failed' }

import { z } from 'zod';

/** Login phone-entry step. */
export const phoneSchema = z.object({
  phone: z.string().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number'),
});
export type PhoneForm = z.infer<typeof phoneSchema>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Register / complete-profile step. */
export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Please enter a valid name')
    .max(30, 'Name is too long'),
  email: z.string().trim().regex(EMAIL_RE, 'Please enter a valid email'),
  referral: z.string().trim().optional(),
});
export type ProfileForm = z.infer<typeof profileSchema>;

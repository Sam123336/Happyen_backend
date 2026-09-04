import { z } from 'zod';

const privacyAudience = z.enum(['nobody', 'friends', 'everyone']);

export const updateProfileSchema = z
  .object({
    bio: z.string().trim().max(300).nullable().optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,30}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field is required',
  );

export const updatePrivacySchema = z
  .object({
    momentsVisibility: privacyAudience.optional(),
    presenceVisibility: privacyAudience.optional(),
    profileVisibility: privacyAudience.optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field is required',
  );

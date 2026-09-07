import { z } from 'zod';

/** Never return the whole city: the map only draws what is on screen. */
const maxRadiusMeters = 50_000;

export const nearbyQuerySchema = z
  .object({
    category: z
      .enum(['music', 'comedy', 'food', 'pets', 'sports', 'other'])
      .optional(),
    lat: z.coerce.number().min(-90).max(90),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    lng: z.coerce.number().min(-180).max(180),
    radius_m: z.coerce
      .number()
      .int()
      .min(1)
      .max(maxRadiusMeters)
      .default(5_000),
    /** Defaults to "from now", because a map of finished events is noise. */
    starts_after: z.coerce.date().optional(),
    starts_before: z.coerce.date().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.starts_after === undefined ||
      value.starts_before === undefined ||
      value.starts_before > value.starts_after,
    'starts_before must be after starts_after',
  );

export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;

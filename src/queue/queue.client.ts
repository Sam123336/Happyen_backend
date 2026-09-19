import { QueueClient } from '@vercel/queue';
import { z } from 'zod';

/**
 * One topic, one shape. A message outlives the deploy that published it, so the
 * consumer validates rather than trusts — the same reason the places cache
 * checks what it reads back.
 */
export const VENUE_CANDIDATES_TOPIC = 'venue-candidates';

export const venueCandidateSchema = z.object({
  address: z.string().nullable(),
  foursquarePlaceId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().min(1),
});

export const venueCandidatesMessageSchema = z.object({
  venues: z.array(venueCandidateSchema).max(50),
});

export type VenueCandidate = z.infer<typeof venueCandidateSchema>;

/** Authenticates through Vercel OIDC; no key of ours is involved. */
export const queue = new QueueClient();

/**
 * Publishing is best effort. A venue candidate is a by-product of a search the
 * caller already has an answer for, so a queue that is unreachable must not
 * turn a successful search into a failed request.
 */
export async function publishVenueCandidates(
  venues: VenueCandidate[],
  idempotencyKey: string,
): Promise<void> {
  if (venues.length === 0) {
    return;
  }
  try {
    await queue.send(
      VENUE_CANDIDATES_TOPIC,
      { venues },
      // The key is the search that produced them: the same search repeated
      // inside the retention window enqueues nothing new.
      { idempotencyKey },
    );
  } catch {
    // Deliberately swallowed; see the doc comment above.
  }
}

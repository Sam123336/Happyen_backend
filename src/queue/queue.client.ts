import { QueueClient } from '@vercel/queue';
import { z } from 'zod';

import { parseEnvironment } from '../config/index.js';
import { createLogger } from '../observability/index.js';

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
  } catch (error) {
    // Swallowed, but never silent. Authentication is OIDC, so a local run
    // without `vercel env pull` fails here every time, and a cache that
    // quietly ingests nothing is the kind of thing nobody notices for weeks.
    const environment = parseEnvironment(process.env);
    createLogger({
      environment: environment.HAPPYN_ENV,
      level: environment.LOG_LEVEL,
      service: 'happyn-api',
    }).warn(
      { err: error, topic: VENUE_CANDIDATES_TOPIC },
      'Could not publish venue candidates; the search was unaffected',
    );
  }
}

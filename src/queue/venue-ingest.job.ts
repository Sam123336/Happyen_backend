import { createLogger } from '../observability/index.js';
import { parseEnvironment } from '../config/index.js';
import {
  venueCandidatesMessageSchema,
  type VenueCandidate,
} from './queue.client.js';

export interface VenueUpsert {
  address: string | null;
  foursquarePlaceId: string;
  location: { coordinates: [number, number]; type: 'Point' };
  name: string;
}

export interface VenueIngestResult {
  ingested: number;
  /** A payload that will never parse; retrying it forever helps nobody. */
  rejected: boolean;
}

/**
 * Turns Foursquare search results into Happyen's own venue rows. Delivery is
 * at-least-once, so this has to be safe to run twice: the upsert keys on
 * `foursquare_place_id`, which the identity migration made unique.
 *
 * An unreadable payload is acknowledged rather than retried. A failing upsert
 * is allowed to throw, because that is the transient case worth redelivering.
 */
export async function runVenueIngest(
  message: unknown,
  upsert: (venue: VenueUpsert) => Promise<void>,
): Promise<VenueIngestResult> {
  const environment = parseEnvironment(process.env);
  const logger = createLogger({
    environment: environment.HAPPYN_ENV,
    level: environment.LOG_LEVEL,
    service: 'happyn-jobs',
  });

  const parsed = venueCandidatesMessageSchema.safeParse(message);
  if (!parsed.success) {
    logger.error(
      { err: parsed.error },
      'Venue ingest got an unreadable message',
    );
    return { ingested: 0, rejected: true };
  }

  for (const candidate of parsed.data.venues) {
    await upsert(toVenue(candidate));
  }

  logger.info(
    { ingested: parsed.data.venues.length },
    'Venue ingest completed',
  );
  return { ingested: parsed.data.venues.length, rejected: false };
}

/** PostGIS takes longitude first; the API speaks latitude first. */
function toVenue(candidate: VenueCandidate): VenueUpsert {
  return {
    address: candidate.address,
    foursquarePlaceId: candidate.foursquarePlaceId,
    location: {
      coordinates: [candidate.longitude, candidate.latitude],
      type: 'Point',
    },
    name: candidate.name,
  };
}

import { Op, col, fn, where as sqlWhere } from 'sequelize';

import { parseEnvironment } from '../config/index.js';
import { Event, EventOccurrence, Venue } from '../database/models.js';
import { createLogger } from '../observability/index.js';
import type { FeedEvent } from './predicthq.client.js';

const SOURCE = 'predicthq';

export interface IngestResult {
  events: number;
  occurrences: number;
  skipped: number;
}

/**
 * Writes a feed into Happyen's own tables. The feed is a provider, never the
 * source of truth: the row here is Happyen's, carrying the provider's id only
 * so tomorrow's run recognises what it already wrote.
 *
 * Safe to run repeatedly — every write is an upsert on a unique key.
 */
export async function ingestFeedEvents(
  feed: FeedEvent[],
): Promise<IngestResult> {
  const environment = parseEnvironment(process.env);
  const logger = createLogger({
    environment: environment.HAPPYN_ENV,
    level: environment.LOG_LEVEL,
    service: 'happyn-jobs',
  });

  const result: IngestResult = { events: 0, occurrences: 0, skipped: 0 };

  for (const item of feed) {
    if (Number.isNaN(item.startAt.getTime())) {
      result.skipped += 1;
      continue;
    }

    const [event] = await Event.findOrCreate({
      defaults: {
        category: item.category,
        description: item.description,
        source: SOURCE,
        sourceId: item.sourceId,
        status: 'published',
        title: item.title,
      },
      where: { source: SOURCE, sourceId: item.sourceId },
    });
    // A feed corrects itself between runs; the title and category follow.
    await event.update({
      category: item.category,
      description: item.description,
      title: item.title,
    });
    result.events += 1;

    const location = {
      coordinates: [item.longitude, item.latitude] as [number, number],
      type: 'Point' as const,
    };

    // The venue is provenance-free here: PredictHQ names a place, it does not
    // give a Foursquare id, so this is Happyen's own row from the start.
    const [venue] = await Venue.findOrCreate({
      defaults: { address: item.address, location, name: item.venueName },
      where: { name: item.venueName },
    });

    const [, created] = await EventOccurrence.findOrCreate({
      defaults: {
        endAt: item.endAt,
        eventId: event.id,
        location,
        startAt: item.startAt,
        status: 'published',
        venueId: venue.id,
        venueName: item.venueName,
      },
      where: { eventId: event.id, startAt: item.startAt },
    });
    if (created) result.occurrences += 1;
  }

  logger.info({ ...result, source: SOURCE }, 'Event feed ingested');
  return result;
}

/** Occurrences that have long since ended stop being worth a map query. */
export async function pruneStaleOccurrences(before: Date): Promise<number> {
  // Bound, not interpolated: a date is safe to inline today and an injection
  // the day someone passes a string through here.
  return EventOccurrence.destroy({
    where: sqlWhere(fn('coalesce', col('end_at'), col('start_at')), {
      [Op.lt]: before,
    }),
  });
}

import { z } from 'zod';

import type { UpstashCache } from '../common/cache/upstash-cache.js';
import type { EventCategory } from './event.types.js';

const PREDICTHQ_URL = 'https://api.predicthq.com/v1/events/';

/**
 * Only the categories that describe something a person would go out to.
 *
 * PredictHQ is built for demand forecasting, so its Bengaluru inventory is
 * mostly `conferences` and `expos`, and `observances` carries entries like the
 * September Equinox — real, but not somewhere you can turn up. Those are left
 * out rather than dressed up as nightlife.
 */
const CATEGORY_MAP: Record<string, EventCategory> = {
  concerts: 'music',
  community: 'other',
  festivals: 'other',
  'performing-arts': 'comedy',
  sports: 'sports',
};

export const PREDICTHQ_CATEGORIES = Object.keys(CATEGORY_MAP);

const eventSchema = z.object({
  category: z.string(),
  description: z.string().nullish(),
  end: z.string().nullish(),
  entities: z
    .array(z.object({ name: z.string().nullish(), type: z.string().nullish() }))
    .nullish(),
  geo: z
    .object({
      address: z
        .object({
          formatted_address: z.string().nullish(),
          locality: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
  id: z.string(),
  /** `[longitude, latitude]`, which is already PostGIS order. */
  location: z.tuple([z.number(), z.number()]).nullish(),
  start: z.string(),
  title: z.string().min(1),
});

const responseSchema = z.object({ results: z.array(z.unknown()) });

export interface FeedEvent {
  address: string | null;
  category: EventCategory;
  description: string | null;
  endAt: Date | null;
  latitude: number;
  longitude: number;
  sourceId: string;
  startAt: Date;
  title: string;
  venueName: string;
}

export class PredictHqClient {
  public constructor(
    private readonly token?: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly cache?: UpstashCache,
  ) {}

  /**
   * Upcoming events around a point. The response is cached because the ingest
   * may be re-run by hand and the feed barely changes within a day — the
   * scheduled run is what keeps the call count near one per day regardless.
   */
  public async upcoming(options: {
    latitude: number;
    limit: number;
    longitude: number;
    radiusKm: number;
  }): Promise<FeedEvent[]> {
    if (this.token === undefined) {
      throw new Error('PREDICTHQ_TOKEN is not configured');
    }

    const url = new URL(PREDICTHQ_URL);
    url.searchParams.set('within', `${options.radiusKm}km@${options.latitude},${options.longitude}`);
    url.searchParams.set('category', PREDICTHQ_CATEGORIES.join(','));
    url.searchParams.set('active.gte', new Date().toISOString().slice(0, 10));
    url.searchParams.set('limit', String(options.limit));
    url.searchParams.set('sort', 'start');

    const key = `predicthq:${url.searchParams.toString()}`;
    const hit = await this.cache?.get(key);
    if (hit !== undefined && hit !== null) {
      const cached = z.array(z.unknown()).safeParse(safeJsonParse(hit));
      if (cached.success) {
        return cached.data.flatMap((raw) => toFeedEvent(raw));
      }
    }

    const response = await this.fetchImpl(url, {
      headers: { accept: 'application/json', authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) {
      throw new Error(`PredictHQ answered ${response.status}`);
    }

    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new Error('PredictHQ returned an unreadable response');
    }

    await this.cache?.set(key, JSON.stringify(parsed.data.results));
    return parsed.data.results.flatMap((raw) => toFeedEvent(raw));
  }
}

/** Drops an entry rather than failing the ingest when it is unusable. */
export function toFeedEvent(raw: unknown): FeedEvent[] {
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return [];

  const event = parsed.data;
  const category = CATEGORY_MAP[event.category];
  // A pin needs somewhere to be; without coordinates there is nothing to show.
  if (category === undefined || !event.location) return [];

  const [longitude, latitude] = event.location;
  const startAt = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  // The feed reports a point-in-time event with `end` equal to `start`, which
  // the `end_after_start` constraint rightly refuses. No duration is null,
  // not a zero-length one.
  const endAt = end && end.getTime() > startAt.getTime() ? end : null;

  return [
    {
      address: event.geo?.address?.formatted_address ?? null,
      category,
      description: event.description ?? null,
      endAt,
      latitude,
      longitude,
      sourceId: event.id,
      startAt,
      title: event.title,
      venueName: venueNameOf(event),
    },
  ];
}

/**
 * `entities` mixes venues with performers: a gig lists the band as an
 * `organization` and the room as a `venue`. Taking the first entity labelled a
 * concert's pin "Kryptos" instead of "Hard Rock Café". Only `venue` counts,
 * and where the feed names none, the street address is a truer label for a map
 * pin than repeating the event's own title.
 */
function venueNameOf(event: z.infer<typeof eventSchema>): string {
  const venue = event.entities?.find((e) => e.type === 'venue' && e.name)?.name;
  return (
    venue ??
    event.geo?.address?.formatted_address ??
    event.geo?.address?.locality ??
    event.title
  );
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service.js';
import { eventOccurrences, events } from '../database/schema/index.js';
import type { EventPin, NearbySearch } from './event.types.js';

@Injectable()
export class EventRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Published occurrences inside `radiusMeters` of a point, soonest first.
   *
   * The geography column is never selected raw — the driver would hand back
   * WKB — so the projection casts to geometry and reads the ordinates back out.
   * `ST_DWithin` on geography is metres, and it is the form that uses
   * `event_occurrences_location_gix`.
   */
  public nearby(search: NearbySearch): Promise<EventPin[]> {
    const origin = sql`ST_SetSRID(ST_MakePoint(${search.longitude}, ${search.latitude}), 4326)::geography`;

    return this.database.client
      .select({
        category: events.category,
        distanceMeters:
          sql<number>`ST_Distance(${eventOccurrences.location}, ${origin})`.mapWith(
            Number,
          ),
        endAt: eventOccurrences.endAt,
        eventId: events.id,
        heroImageUrl: events.heroImageUrl,
        id: eventOccurrences.id,
        latitude:
          sql<number>`ST_Y(${eventOccurrences.location}::geometry)`.mapWith(
            Number,
          ),
        longitude:
          sql<number>`ST_X(${eventOccurrences.location}::geometry)`.mapWith(
            Number,
          ),
        startAt: eventOccurrences.startAt,
        title: events.title,
        venueName: eventOccurrences.venueName,
      })
      .from(eventOccurrences)
      .innerJoin(events, eq(eventOccurrences.eventId, events.id))
      .where(
        and(
          eq(eventOccurrences.status, 'published'),
          eq(events.status, 'published'),
          sql`ST_DWithin(${eventOccurrences.location}, ${origin}, ${search.radiusMeters})`,
          gte(eventOccurrences.startAt, search.startsAfter),
          search.startsBefore === undefined
            ? undefined
            : lte(eventOccurrences.startAt, search.startsBefore),
          search.category === undefined
            ? undefined
            : eq(events.category, search.category),
        ),
      )
      .orderBy(asc(eventOccurrences.startAt))
      .limit(search.limit);
  }
}

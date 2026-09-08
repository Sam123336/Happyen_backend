import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, gt, isNull, lte, or, sql } from 'drizzle-orm';

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
    // Use one timestamp for both the live projection and the predicate. That
    // makes a response internally consistent if an event crosses its start or
    // end boundary while Postgres is evaluating the query.
    const now = new Date();
    const activeOccurrence = and(
      lte(eventOccurrences.startAt, now),
      or(isNull(eventOccurrences.endAt), gt(eventOccurrences.endAt, now)),
    );
    const upcomingOccurrence = and(
      gte(eventOccurrences.startAt, search.startsAfter),
      search.startsBefore === undefined
        ? undefined
        : lte(eventOccurrences.startAt, search.startsBefore),
    );

    // A city map is useful while an event is underway as well as before it
    // starts. Callers that are rendering a future-only time window can opt
    // out of the live branch with includeLive=false.
    const timeWindow =
      (search.includeLive ?? true)
        ? or(activeOccurrence, upcomingOccurrence)
        : upcomingOccurrence;

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
        isLive: sql<boolean>`(${eventOccurrences.startAt} <= ${now} AND (${eventOccurrences.endAt} IS NULL OR ${eventOccurrences.endAt} > ${now}))`,
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
          timeWindow,
          search.category === undefined
            ? undefined
            : eq(events.category, search.category),
        ),
      )
      .orderBy(asc(eventOccurrences.startAt))
      .limit(search.limit);
  }
}

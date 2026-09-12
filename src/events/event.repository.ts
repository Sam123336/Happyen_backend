import { Injectable } from '@nestjs/common';
import { Op, cast, col, fn, where as sqlWhere } from 'sequelize';

import { DatabaseService } from '../database/database.service.js';
import { EventOccurrence } from '../database/models.js';
import type { EventPin, NearbySearch } from './event.types.js';

@Injectable()
export class EventRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Published occurrences inside `radiusMeters` of a point, soonest first.
   *
   * `ST_DWithin` on geography is metres, and it is the form that uses
   * `event_occurrences_location_gix`. The geography column itself comes back
   * as GeoJSON, so the coordinates are read off it rather than projected.
   */
  public async nearby(search: NearbySearch): Promise<EventPin[]> {
    void this.database;
    const origin = cast(
      fn(
        'ST_SetSRID',
        fn('ST_MakePoint', search.longitude, search.latitude),
        4326,
      ),
      'geography',
    );
    const location = col('EventOccurrence.location');
    // Use one timestamp for both the live flag and the predicate. That makes a
    // response internally consistent if an event crosses its start or end
    // boundary while the query runs.
    const now = new Date();
    const activeOccurrence = {
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
      startAt: { [Op.lte]: now },
    };
    const upcomingOccurrence = {
      startAt: {
        [Op.gte]: search.startsAfter,
        ...(search.startsBefore === undefined
          ? {}
          : { [Op.lte]: search.startsBefore }),
      },
    };

    // A city map is useful while an event is underway as well as before it
    // starts. Callers that are rendering a future-only time window can opt
    // out of the live branch with includeLive=false.
    const timeWindow =
      (search.includeLive ?? true)
        ? { [Op.or]: [activeOccurrence, upcomingOccurrence] }
        : upcomingOccurrence;

    const rows = await EventOccurrence.findAll({
      attributes: {
        include: [[fn('ST_Distance', location, origin), 'distanceMeters']],
      },
      include: [
        {
          association: 'event',
          attributes: ['category', 'heroImageUrl', 'title'],
          required: true,
          where: {
            status: 'published',
            ...(search.category === undefined
              ? {}
              : { category: search.category }),
          },
        },
      ],
      limit: search.limit,
      order: [['startAt', 'ASC']],
      where: {
        [Op.and]: [
          { status: 'published' },
          sqlWhere(
            fn('ST_DWithin', location, origin, search.radiusMeters),
            true,
          ),
          timeWindow,
        ],
      },
    });

    return rows.map((row) => {
      const event = row.event;
      if (event === undefined) {
        throw new Error('Occurrence loaded without its event');
      }
      const [longitude, latitude] = row.location.coordinates;
      return {
        category: event.category,
        distanceMeters: Number(row.get('distanceMeters')),
        endAt: row.endAt,
        eventId: row.eventId,
        heroImageUrl: event.heroImageUrl,
        id: row.id,
        isLive: row.startAt <= now && (row.endAt === null || row.endAt > now),
        latitude,
        longitude,
        startAt: row.startAt,
        title: event.title,
        venueName: row.venueName,
      };
    });
  }
}

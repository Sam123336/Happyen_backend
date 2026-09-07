import { config as loadEnvironment } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { parseEnvironment } from '../config/index.js';
import { eventOccurrences, events, venues } from './schema/index.js';
import type { EventCategory } from '../events/event.types.js';

/**
 * Demonstration data, not a listing feed. The venues below are invented names
 * at real Bengaluru coordinates so the map has pins to draw before any real
 * inventory exists. Nothing here describes an event that is actually happening.
 */
loadEnvironment({ path: new URL('../../.env', import.meta.url) });

const environment = parseEnvironment(process.env);

if (environment.HAPPYN_ENV === 'production') {
  throw new Error('Refusing to seed demonstration data into production');
}

const hour = 60 * 60 * 1000;
const now = Date.now();

interface Sample {
  category: EventCategory;
  eventId: string;
  latitude: number;
  longitude: number;
  occurrenceId: string;
  startsInHours: number;
  title: string;
  venueId: string;
  venueName: string;
}

const samples: Sample[] = [
  {
    category: 'comedy',
    eventId: '11111111-1111-4111-8111-000000000001',
    latitude: 12.9784,
    longitude: 77.6408,
    occurrenceId: '22222222-2222-4222-8222-000000000001',
    startsInHours: 2,
    title: 'Open Mic: First Drafts',
    venueId: '33333333-3333-4333-8333-000000000001',
    venueName: 'Neon Terrace',
  },
  {
    category: 'music',
    eventId: '11111111-1111-4111-8111-000000000002',
    latitude: 12.9352,
    longitude: 77.6245,
    occurrenceId: '22222222-2222-4222-8222-000000000002',
    startsInHours: 5,
    title: 'Basement Session: Dub & Bass',
    venueId: '33333333-3333-4333-8333-000000000002',
    venueName: 'The Basement Room',
  },
  {
    category: 'food',
    eventId: '11111111-1111-4111-8111-000000000003',
    latitude: 12.9756,
    longitude: 77.605,
    occurrenceId: '22222222-2222-4222-8222-000000000003',
    startsInHours: 20,
    title: 'Filter Coffee Cupping',
    venueId: '33333333-3333-4333-8333-000000000003',
    venueName: 'Kadu Coffee Yard',
  },
  {
    category: 'pets',
    eventId: '11111111-1111-4111-8111-000000000004',
    latitude: 12.9763,
    longitude: 77.5929,
    occurrenceId: '22222222-2222-4222-8222-000000000004',
    startsInHours: 26,
    title: 'Sunday Morning Dog Walk',
    venueId: '33333333-3333-4333-8333-000000000004',
    venueName: 'Barkside Green',
  },
  {
    category: 'sports',
    eventId: '11111111-1111-4111-8111-000000000005',
    latitude: 12.9116,
    longitude: 77.6389,
    occurrenceId: '22222222-2222-4222-8222-000000000005',
    startsInHours: 30,
    title: 'Five-a-Side Ladder Night',
    venueId: '33333333-3333-4333-8333-000000000005',
    venueName: 'Sideline Courts',
  },
];

const point = (longitude: number, latitude: number) =>
  sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;

const pool = new Pool({
  connectionString: environment.DIRECT_URL ?? environment.DATABASE_URL,
});
const database = drizzle(pool);

try {
  for (const sample of samples) {
    const location = point(sample.longitude, sample.latitude);
    const startAt = new Date(now + sample.startsInHours * hour);

    await database
      .insert(venues)
      .values({
        id: sample.venueId,
        location,
        name: sample.venueName,
      })
      .onConflictDoUpdate({
        set: { location, name: sample.venueName, updatedAt: new Date() },
        target: venues.id,
      });

    await database
      .insert(events)
      .values({
        category: sample.category,
        id: sample.eventId,
        status: 'published',
        title: sample.title,
      })
      .onConflictDoUpdate({
        set: {
          status: 'published',
          title: sample.title,
          updatedAt: new Date(),
        },
        target: events.id,
      });

    // Start times are relative to the run, so a reseed always leaves the map
    // with something upcoming rather than a wall of finished events.
    await database
      .insert(eventOccurrences)
      .values({
        endAt: new Date(startAt.getTime() + 3 * hour),
        eventId: sample.eventId,
        id: sample.occurrenceId,
        location,
        startAt,
        status: 'published',
        venueId: sample.venueId,
        venueName: sample.venueName,
      })
      .onConflictDoUpdate({
        set: {
          endAt: new Date(startAt.getTime() + 3 * hour),
          location,
          startAt,
          status: 'published',
          updatedAt: new Date(),
        },
        target: eventOccurrences.id,
      });
  }

  console.log(`Seeded ${samples.length} demonstration events`);
} finally {
  await pool.end();
}

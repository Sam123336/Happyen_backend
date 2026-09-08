import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import * as schema from '../database/schema/index.js';
import { eventOccurrences, events, venues } from '../database/schema/index.js';
import { EventRepository } from './event.repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase =
  databaseUrl === undefined ? describe.skip : describe;

// Cubbon Park, and a point roughly 12km out towards the airport road.
const origin = { latitude: 12.9763, longitude: 77.5929 };
const farAway = { latitude: 13.0827, longitude: 77.5877 };

const eventId = '44444444-4444-4444-8444-000000000001';
const nearId = '55555555-5555-4555-8555-000000000001';
const farId = '55555555-5555-4555-8555-000000000002';
const liveId = '55555555-5555-4555-8555-000000000003';
const venueId = '66666666-6666-4666-8666-000000000001';

describeWithDatabase('EventRepository integration', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool, { schema });
  const repository = new EventRepository(new DatabaseService(database, pool));
  const startAt = new Date(Date.now() + 60 * 60 * 1000);

  const point = (place: { latitude: number; longitude: number }) =>
    sql`ST_SetSRID(ST_MakePoint(${place.longitude}, ${place.latitude}), 4326)::geography`;

  beforeAll(async () => {
    await database.insert(venues).values({
      id: venueId,
      location: point(origin),
      name: 'Test Venue',
    });
    await database.insert(events).values({
      category: 'comedy',
      id: eventId,
      status: 'published',
      title: 'Integration Night',
    });
    await database.insert(eventOccurrences).values([
      {
        eventId,
        id: nearId,
        location: point(origin),
        startAt,
        status: 'published',
        venueId,
        venueName: 'Test Venue',
      },
      {
        eventId,
        id: farId,
        location: point(farAway),
        startAt,
        status: 'published',
        venueName: 'Far Venue',
      },
      {
        endAt: new Date(Date.now() + 60 * 60 * 1000),
        eventId,
        id: liveId,
        location: point(origin),
        startAt: new Date(Date.now() - 60 * 60 * 1000),
        status: 'published',
        venueId,
        venueName: 'Live Venue',
      },
    ]);
  });

  afterAll(async () => {
    await database.delete(events).where(sql`${events.id} = ${eventId}`);
    await database.delete(venues).where(sql`${venues.id} = ${venueId}`);
    await pool.end();
  });

  it('returns coordinates back out of the geography column', async () => {
    const [pin] = await repository.nearby({
      latitude: origin.latitude,
      limit: 10,
      longitude: origin.longitude,
      radiusMeters: 2_000,
      startsAfter: new Date(),
    });

    expect(pin?.id).toBe(nearId);
    expect(pin?.latitude).toBeCloseTo(origin.latitude, 5);
    expect(pin?.longitude).toBeCloseTo(origin.longitude, 5);
    expect(pin?.distanceMeters).toBeLessThan(1);
    expect(pin?.venueName).toBe('Test Venue');
    expect(pin?.isLive).toBe(false);
  });

  it('excludes an occurrence outside the radius', async () => {
    const pins = await repository.nearby({
      latitude: origin.latitude,
      limit: 10,
      longitude: origin.longitude,
      radiusMeters: 2_000,
      startsAfter: new Date(),
    });

    expect(pins.map((pin) => pin.id)).not.toContain(farId);
  });

  it('includes it once the radius reaches that far', async () => {
    const pins = await repository.nearby({
      latitude: origin.latitude,
      limit: 10,
      longitude: origin.longitude,
      radiusMeters: 20_000,
      startsAfter: new Date(),
    });

    expect(pins.map((pin) => pin.id)).toContain(farId);
  });

  it('filters by category', async () => {
    const pins = await repository.nearby({
      category: 'music',
      latitude: origin.latitude,
      limit: 10,
      longitude: origin.longitude,
      radiusMeters: 20_000,
      startsAfter: new Date(),
    });

    expect(pins).toEqual([]);
  });

  it('keeps an ongoing occurrence on the live map', async () => {
    const pins = await repository.nearby({
      latitude: origin.latitude,
      limit: 10,
      longitude: origin.longitude,
      radiusMeters: 2_000,
      startsAfter: new Date(),
    });

    expect(pins.find((pin) => pin.id === liveId)?.isLive).toBe(true);
  });

  it('can render a future-only time window without live occurrences', async () => {
    const pins = await repository.nearby({
      includeLive: false,
      latitude: origin.latitude,
      limit: 10,
      longitude: origin.longitude,
      radiusMeters: 2_000,
      startsAfter: new Date(),
    });

    expect(pins.map((pin) => pin.id)).not.toContain(liveId);
  });
});

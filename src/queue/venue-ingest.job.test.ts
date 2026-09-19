import { beforeEach, describe, expect, it } from 'vitest';

import { runVenueIngest, type VenueUpsert } from './venue-ingest.job.js';

const candidate = {
  address: '1 MG Road, Bengaluru',
  foursquarePlaceId: 'abc123',
  latitude: 12.9716,
  longitude: 77.5946,
  name: 'The Humming Tree',
};

function collector() {
  const upserted: VenueUpsert[] = [];
  return {
    upsert: (venue: VenueUpsert) => {
      upserted.push(venue);
      return Promise.resolve();
    },
    upserted,
  };
}

describe('runVenueIngest', () => {
  beforeEach(() => {
    process.env = { DATABASE_URL: 'postgresql://localhost/happyn' };
  });

  it('writes a candidate out as a venue with PostGIS coordinate order', async () => {
    const { upsert, upserted } = collector();

    const result = await runVenueIngest({ venues: [candidate] }, upsert);

    expect(result).toEqual({ ingested: 1, rejected: false });
    expect(upserted[0]).toEqual({
      address: '1 MG Road, Bengaluru',
      foursquarePlaceId: 'abc123',
      // Longitude first: what PostGIS takes, the reverse of the API's order.
      location: { coordinates: [77.5946, 12.9716], type: 'Point' },
      name: 'The Humming Tree',
    });
  });

  it('rejects an unreadable payload instead of retrying it forever', async () => {
    const { upsert, upserted } = collector();

    const result = await runVenueIngest(
      { venues: [{ name: 'no id' }] },
      upsert,
    );

    expect(result).toEqual({ ingested: 0, rejected: true });
    expect(upserted).toHaveLength(0);
  });

  it('rejects a message that is not a venue batch at all', async () => {
    const { upsert } = collector();

    await expect(runVenueIngest('nonsense', upsert)).resolves.toMatchObject({
      rejected: true,
    });
  });

  it('lets a failing write throw, so the message is redelivered', async () => {
    await expect(
      runVenueIngest({ venues: [candidate] }, () =>
        Promise.reject(new Error('connection terminated')),
      ),
    ).rejects.toThrow('connection terminated');
  });
});

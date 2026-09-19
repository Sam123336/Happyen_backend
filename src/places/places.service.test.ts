import { describe, expect, it } from 'vitest';

import { UpstashCache } from '../common/cache/upstash-cache.js';
import { PlacesService } from './places.service.js';

function stubFetch(body: unknown, ok = true, status = 200) {
  const calls: URL[] = [];
  const headers: HeadersInit[] = [];
  const fetchImpl = (url: URL, init?: RequestInit) => {
    calls.push(url);
    headers.push(init?.headers ?? {});
    return Promise.resolve({
      json: () => Promise.resolve(body),
      ok,
      status,
    });
  };
  return { calls, fetchImpl, headers };
}

const bengaluru = { latitude: 12.9716, limit: 2, longitude: 77.5946 };

/** An in-memory stand-in for Upstash, driven through the real REST client. */
function stubUpstash(options: { failing?: boolean } = {}) {
  const store = new Map<string, string>();
  const commands: string[][] = [];
  const fetchImpl = (_url: URL | string, init?: RequestInit) => {
    if (options.failing === true) {
      return Promise.reject(new Error('upstash unreachable'));
    }
    const command = JSON.parse(init?.body as string) as string[];
    commands.push(command);
    if (command[0] === 'GET') {
      return Promise.resolve({
        json: () => Promise.resolve({ result: store.get(command[1]!) ?? null }),
        ok: true,
      });
    }
    store.set(command[1]!, command[2]!);
    return Promise.resolve({
      json: () => Promise.resolve({ result: 'OK' }),
      ok: true,
    });
  };
  const cache = new UpstashCache(
    'https://upstash.test',
    'upstash-token',
    900,
    fetchImpl as never,
  );
  return { cache, commands, store };
}

const result = {
  categories: [{ name: 'Music Venue' }],
  distance: 340,
  fsq_place_id: 'abc123',
  latitude: 12.97,
  location: { formatted_address: '1 MG Road, Bengaluru' },
  longitude: 77.59,
  name: 'The Humming Tree',
  photos: [{ prefix: 'https://fastly.fsq.com/img/', suffix: '/abc.jpg' }],
};

describe('PlacesService', () => {
  it('calls Foursquare with the search and maps the results', async () => {
    const { calls, fetchImpl, headers } = stubFetch({ results: [result] });

    await expect(
      new PlacesService('service-key', fetchImpl as never).search({
        ...bengaluru,
        query: 'gig',
        radiusMeters: 1500,
      }),
    ).resolves.toEqual([
      {
        address: '1 MG Road, Bengaluru',
        categories: ['Music Venue'],
        distanceMeters: 340,
        id: 'abc123',
        latitude: 12.97,
        longitude: 77.59,
        name: 'The Humming Tree',
        photoUrl: 'https://fastly.fsq.com/img/original/abc.jpg',
      },
    ]);

    const url = calls[0]!;
    expect(url.origin + url.pathname).toBe(
      'https://places-api.foursquare.com/places/search',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '2',
      ll: '12.9716,77.5946',
      query: 'gig',
      radius: '1500',
    });
    expect(headers[0]).toMatchObject({
      'X-Places-Api-Version': '2025-06-17',
      authorization: 'Bearer service-key',
    });
  });

  it('omits optional parameters that were not supplied', async () => {
    const { calls, fetchImpl } = stubFetch({ results: [] });

    await new PlacesService('service-key', fetchImpl as never).search(
      bengaluru,
    );

    expect(calls[0]!.searchParams.has('query')).toBe(false);
    expect(calls[0]!.searchParams.has('radius')).toBe(false);
  });

  it('drops a result it cannot place on the map', async () => {
    const { fetchImpl } = stubFetch({
      results: [{ fsq_place_id: 'no-coordinates', name: 'Somewhere' }, result],
    });

    await expect(
      new PlacesService('service-key', fetchImpl as never).search(bengaluru),
    ).resolves.toHaveLength(1);
  });

  it('reports a rejected search as an unavailable dependency', async () => {
    const { fetchImpl } = stubFetch({}, false, 401);

    await expect(
      new PlacesService('expired-key', fetchImpl as never).search(bengaluru),
    ).rejects.toThrow('status 401');
  });

  it('refuses to search when no key is configured', async () => {
    await expect(new PlacesService().search(bengaluru)).rejects.toThrow(
      'FOURSQUARE_API_KEY is not configured',
    );
  });

  it('serves a repeated search from the cache without calling Foursquare', async () => {
    const { calls, fetchImpl } = stubFetch({ results: [result] });
    const { cache } = stubUpstash();
    const places = new PlacesService('service-key', fetchImpl as never, cache);

    const first = await places.search(bengaluru);
    const second = await places.search(bengaluru);

    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
  });

  it('treats a fix that jitters within the grid as the same search', async () => {
    const { calls, fetchImpl } = stubFetch({ results: [result] });
    const { cache } = stubUpstash();
    const places = new PlacesService('service-key', fetchImpl as never, cache);

    await places.search(bengaluru);
    await places.search({ ...bengaluru, latitude: 12.97162 });

    expect(calls).toHaveLength(1);
  });

  it('still calls Foursquare for a search on a different grid square', async () => {
    const { calls, fetchImpl } = stubFetch({ results: [result] });
    const { cache } = stubUpstash();
    const places = new PlacesService('service-key', fetchImpl as never, cache);

    await places.search(bengaluru);
    await places.search({ ...bengaluru, latitude: 13.5 });

    expect(calls).toHaveLength(2);
  });

  it('stores the entry with the configured expiry', async () => {
    const { fetchImpl } = stubFetch({ results: [result] });
    const { cache, commands } = stubUpstash();

    await new PlacesService('service-key', fetchImpl as never, cache).search(
      bengaluru,
    );

    const write = commands.find((command) => command[0] === 'SET');
    expect(write?.slice(-2)).toEqual(['EX', '900']);
  });

  it('falls back to Foursquare when a cached entry is unreadable', async () => {
    const { calls, fetchImpl } = stubFetch({ results: [result] });
    const { cache, store } = stubUpstash();
    const places = new PlacesService('service-key', fetchImpl as never, cache);

    await places.search(bengaluru);
    for (const key of store.keys()) {
      store.set(key, '{"truncated"');
    }
    const recovered = await places.search(bengaluru);

    expect(calls).toHaveLength(2);
    expect(recovered).toHaveLength(1);
  });

  it('keeps searching when the cache is unreachable', async () => {
    const { calls, fetchImpl } = stubFetch({ results: [result] });
    const { cache } = stubUpstash({ failing: true });
    const places = new PlacesService('service-key', fetchImpl as never, cache);

    await expect(places.search(bengaluru)).resolves.toHaveLength(1);
    await expect(places.search(bengaluru)).resolves.toHaveLength(1);
    // Every search goes upstream, but a Redis outage never fails the request.
    expect(calls).toHaveLength(2);
  });

  it('publishes the venues behind a fresh search', async () => {
    const { fetchImpl } = stubFetch({ results: [result] });
    const published: unknown[][] = [];

    await new PlacesService(
      'service-key',
      fetchImpl as never,
      undefined,
      (venues) => {
        published.push(venues);
        return Promise.resolve();
      },
    ).search(bengaluru);

    expect(published).toEqual([
      [
        {
          address: '1 MG Road, Bengaluru',
          foursquarePlaceId: 'abc123',
          latitude: 12.97,
          longitude: 77.59,
          name: 'The Humming Tree',
        },
      ],
    ]);
  });

  it('does not re-publish venues for a search served from the cache', async () => {
    const { fetchImpl } = stubFetch({ results: [result] });
    const { cache } = stubUpstash();
    let publishes = 0;
    const places = new PlacesService(
      'service-key',
      fetchImpl as never,
      cache,
      () => {
        publishes += 1;
        return Promise.resolve();
      },
    );

    await places.search(bengaluru);
    await places.search(bengaluru);

    expect(publishes).toBe(1);
  });

  it('still answers the search when publishing fails', async () => {
    const { fetchImpl } = stubFetch({ results: [result] });

    await expect(
      new PlacesService('service-key', fetchImpl as never, undefined, () =>
        Promise.reject(new Error('queue unreachable')),
      ).search(bengaluru),
    ).resolves.toHaveLength(1);
  });
});

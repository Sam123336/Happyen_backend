import { describe, expect, it } from 'vitest';

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
});

import { ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Foursquare pins response behaviour to a dated version rather than a path
 * segment, and rejects requests that omit it. Bump this deliberately.
 */
const PLACES_API_VERSION = '2025-06-17';
const PLACES_SEARCH_URL = 'https://places-api.foursquare.com/places/search';

/** A venue candidate, reduced to what the map and event forms need. */
export interface Place {
  address: string | null;
  categories: string[];
  distanceMeters: number | null;
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  photoUrl: string | null;
}

export interface PlaceSearch {
  latitude: number;
  limit: number;
  longitude: number;
  query?: string;
  radiusMeters?: number;
}

const foursquarePlaceSchema = z.object({
  categories: z.array(z.object({ name: z.string() })).optional(),
  distance: z.number().optional(),
  fsq_place_id: z.string(),
  latitude: z.number(),
  location: z.object({ formatted_address: z.string().optional() }).optional(),
  longitude: z.number(),
  name: z.string(),
  /** Only present when the account's plan returns photos on search. */
  photos: z
    .array(z.object({ prefix: z.string(), suffix: z.string() }))
    .optional(),
});

const foursquareSearchSchema = z.object({ results: z.array(z.unknown()) });

/** Drops a result rather than failing the whole search when it is unusable. */
function toPlace(result: unknown): Place[] {
  const parsed = foursquarePlaceSchema.safeParse(result);
  if (!parsed.success) {
    return [];
  }

  const place = parsed.data;
  const photo = place.photos?.[0];
  return [
    {
      address: place.location?.formatted_address ?? null,
      categories: place.categories?.map((category) => category.name) ?? [],
      distanceMeters: place.distance ?? null,
      id: place.fsq_place_id,
      latitude: place.latitude,
      longitude: place.longitude,
      name: place.name,
      photoUrl:
        photo === undefined ? null : `${photo.prefix}original${photo.suffix}`,
    },
  ];
}

export class PlacesService {
  public constructor(
    private readonly apiKey?: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  public async search(search: PlaceSearch): Promise<Place[]> {
    if (this.apiKey === undefined) {
      throw new ServiceUnavailableException({
        code: 'places_provider_not_configured',
        message: 'FOURSQUARE_API_KEY is not configured',
      });
    }

    const url = new URL(PLACES_SEARCH_URL);
    url.searchParams.set('ll', `${search.latitude},${search.longitude}`);
    url.searchParams.set('limit', String(search.limit));
    if (search.query !== undefined) {
      url.searchParams.set('query', search.query);
    }
    if (search.radiusMeters !== undefined) {
      url.searchParams.set('radius', String(search.radiusMeters));
    }

    const response = await this.fetchImpl(url, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${this.apiKey}`,
        'X-Places-Api-Version': PLACES_API_VERSION,
      },
    });

    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'places_provider_unavailable',
        message: `Foursquare rejected the search with status ${response.status}`,
      });
    }

    const body: unknown = await response.json().catch(() => null);
    const parsed = foursquareSearchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ServiceUnavailableException({
        code: 'places_provider_unreadable',
        message: 'Foursquare returned an unreadable response',
      });
    }

    return parsed.data.results.flatMap(toPlace);
  }
}

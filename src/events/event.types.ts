export type EventCategory =
  'music' | 'comedy' | 'food' | 'pets' | 'sports' | 'other';

/** One occurrence, reduced to what a map pin and its card need. */
export interface EventPin {
  category: EventCategory;
  distanceMeters: number;
  endAt: Date | null;
  eventId: string;
  heroImageUrl: string | null;
  id: string;
  latitude: number;
  longitude: number;
  startAt: Date;
  title: string;
  venueName: string;
}

export interface NearbySearch {
  category?: EventCategory;
  latitude: number;
  limit: number;
  longitude: number;
  radiusMeters: number;
  startsAfter: Date;
  startsBefore?: Date;
}

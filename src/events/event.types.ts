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
  /** True when the occurrence has started and has not ended yet. */
  isLive: boolean;
  latitude: number;
  longitude: number;
  startAt: Date;
  title: string;
  venueName: string;
}

export interface NearbySearch {
  category?: EventCategory;
  /** Include active occurrences alongside future ones. Defaults to true. */
  includeLive?: boolean;
  latitude: number;
  limit: number;
  longitude: number;
  radiusMeters: number;
  startsAfter: Date;
  startsBefore?: Date;
}

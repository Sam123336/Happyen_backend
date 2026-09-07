import { relations, sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * `geography(Point,4326)` measures in metres, which is what every proximity
 * query here wants. Drizzle has no geography column and the driver returns WKB,
 * so nothing reads this column directly: queries project `ST_X`/`ST_Y` and
 * writes go through `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.
 */
const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType: () => 'geography(Point,4326)',
});

/**
 * The categories the city screen filters by. An enum keeps this a migration
 * rather than a table nobody administers yet.
 * ponytail: enum, becomes `event_categories` when organizers pick their own.
 */
export const eventCategory = pgEnum('event_category', [
  'music',
  'comedy',
  'food',
  'pets',
  'sports',
  'other',
]);

export const eventStatus = pgEnum('event_status', [
  'draft',
  'published',
  'cancelled',
]);

export const venues = pgTable(
  'venues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 160 }).notNull(),
    address: text('address'),
    /**
     * Set when the venue was first matched from Foursquare. Provenance only —
     * Happyen's row stays the source of truth, because the Foursquare licence
     * forbids building an offering competitive with theirs on their data.
     */
    foursquarePlaceId: varchar('foursquare_place_id', { length: 64 }),
    location: geographyPoint('location').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('venues_location_gix').using('gist', table.location),
    uniqueIndex('venues_foursquare_place_id_uq').on(table.foursquarePlaceId),
  ],
);

/** The canonical concept: "Bangalore Comedy Night", not one of its nights. */
export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    category: eventCategory('category').default('other').notNull(),
    status: eventStatus('status').default('draft').notNull(),
    heroImageUrl: text('hero_image_url'),
    /** External ticketing lives off-platform; Happyen only links out. */
    ticketUrl: text('ticket_url'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('events_category_idx').on(table.category)],
);

/**
 * One actual instance, with a location snapshot. The snapshot is deliberate:
 * history stays true when a venue moves or is corrected, and discovery never
 * has to join through a mutable address.
 */
export const eventOccurrences = pgTable(
  'event_occurrences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    venueId: uuid('venue_id').references(() => venues.id, {
      onDelete: 'set null',
    }),
    venueName: varchar('venue_name', { length: 160 }).notNull(),
    location: geographyPoint('location').notNull(),
    startAt: timestamp('start_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    endAt: timestamp('end_at', { mode: 'date', withTimezone: true }),
    status: eventStatus('status').default('draft').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('event_occurrences_location_gix').using('gist', table.location),
    index('event_occurrences_event_start_idx').on(table.eventId, table.startAt),
    index('event_occurrences_published_start_idx')
      .on(table.startAt)
      .where(sql`status = 'published'`),
    check(
      'event_occurrences_end_after_start_ck',
      sql`${table.endAt} IS NULL OR ${table.endAt} > ${table.startAt}`,
    ),
  ],
);

export const venuesRelations = relations(venues, ({ many }) => ({
  occurrences: many(eventOccurrences),
}));

export const eventsRelations = relations(events, ({ many }) => ({
  occurrences: many(eventOccurrences),
}));

export const eventOccurrencesRelations = relations(
  eventOccurrences,
  ({ one }) => ({
    event: one(events, {
      fields: [eventOccurrences.eventId],
      references: [events.id],
    }),
    venue: one(venues, {
      fields: [eventOccurrences.venueId],
      references: [venues.id],
    }),
  }),
);

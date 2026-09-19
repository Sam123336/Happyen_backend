import { DataTypes, Op, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

/**
 * Provenance for events that came from a feed rather than from Happyen.
 *
 * A scheduled ingest runs again tomorrow over the same window, so it needs a
 * key to recognise what it already wrote. Without one, every run would insert
 * the city's events a second time.
 *
 * Same principle as `venues.foursquare_place_id`: the provider's id is
 * recorded, Happyen's row stays the source of truth.
 */
export const up: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.addColumn('events', 'source', {
    type: DataTypes.STRING(32),
  });
  await queryInterface.addColumn('events', 'source_id', {
    type: DataTypes.STRING(128),
  });
  // Partial, so the many events with no source stay unconstrained.
  await queryInterface.addIndex('events', {
    fields: ['source', 'source_id'],
    name: 'events_source_source_id_uq',
    unique: true,
    where: { source: { [Op.ne]: null } },
  });

  // One occurrence per event per start time: what makes re-ingesting the same
  // feed idempotent at the occurrence level too.
  await queryInterface.addIndex('event_occurrences', {
    fields: ['event_id', 'start_at'],
    name: 'event_occurrences_event_start_uq',
    unique: true,
  });
};

export const down: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.removeIndex(
    'event_occurrences',
    'event_occurrences_event_start_uq',
  );
  await queryInterface.removeIndex('events', 'events_source_source_id_uq');
  await queryInterface.removeColumn('events', 'source_id');
  await queryInterface.removeColumn('events', 'source');
};

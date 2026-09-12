import { DataTypes, Op, col, literal, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

/**
 * Events: `venues`, `events`, `event_occurrences`, with PostGIS geography
 * columns and GiST indexes. A port of the second Drizzle migration.
 */

const stamps = {
  created_at: {
    allowNull: false,
    defaultValue: literal('now()'),
    type: DataTypes.DATE,
  },
  updated_at: {
    allowNull: false,
    defaultValue: literal('now()'),
    type: DataTypes.DATE,
  },
};

const generatedId = {
  allowNull: false,
  defaultValue: literal('gen_random_uuid()'),
  primaryKey: true,
  type: DataTypes.UUID,
};

const status = {
  allowNull: false,
  defaultValue: 'draft',
  type: DataTypes.ENUM('draft', 'published', 'cancelled'),
};

/** `geography(Point,4326)` measures in metres, which every proximity query wants. */
const point = { allowNull: false, type: DataTypes.GEOGRAPHY('POINT', 4326) };

export const up: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.createTable('venues', {
    id: generatedId,
    name: { allowNull: false, type: DataTypes.STRING(160) },
    address: DataTypes.TEXT,
    foursquare_place_id: DataTypes.STRING(64),
    location: point,
    ...stamps,
  });
  await queryInterface.addIndex('venues', {
    fields: ['location'],
    name: 'venues_location_gix',
    using: 'gist',
  });
  await queryInterface.addIndex('venues', {
    fields: ['foursquare_place_id'],
    name: 'venues_foursquare_place_id_uq',
    unique: true,
  });

  await queryInterface.createTable('events', {
    id: generatedId,
    title: { allowNull: false, type: DataTypes.STRING(200) },
    description: DataTypes.TEXT,
    category: {
      allowNull: false,
      defaultValue: 'other',
      type: DataTypes.ENUM(
        'music',
        'comedy',
        'food',
        'pets',
        'sports',
        'other',
      ),
    },
    status,
    hero_image_url: DataTypes.TEXT,
    ticket_url: DataTypes.TEXT,
    ...stamps,
  });
  await queryInterface.addIndex('events', {
    fields: ['category'],
    name: 'events_category_idx',
  });

  await queryInterface.createTable('event_occurrences', {
    id: generatedId,
    event_id: {
      allowNull: false,
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
      references: { key: 'id', model: 'events' },
      type: DataTypes.UUID,
    },
    venue_id: {
      onDelete: 'SET NULL',
      onUpdate: 'NO ACTION',
      references: { key: 'id', model: 'venues' },
      type: DataTypes.UUID,
    },
    venue_name: { allowNull: false, type: DataTypes.STRING(160) },
    location: point,
    start_at: { allowNull: false, type: DataTypes.DATE },
    end_at: DataTypes.DATE,
    status,
    ...stamps,
  });
  await queryInterface.addIndex('event_occurrences', {
    fields: ['location'],
    name: 'event_occurrences_location_gix',
    using: 'gist',
  });
  await queryInterface.addIndex('event_occurrences', {
    fields: ['event_id', 'start_at'],
    name: 'event_occurrences_event_start_idx',
  });
  await queryInterface.addIndex('event_occurrences', {
    fields: ['start_at'],
    name: 'event_occurrences_published_start_idx',
    where: { status: 'published' },
  });
  await queryInterface.addConstraint('event_occurrences', {
    fields: ['end_at', 'start_at'],
    name: 'event_occurrences_end_after_start_ck',
    type: 'check',
    where: {
      [Op.or]: [{ end_at: null }, { end_at: { [Op.gt]: col('start_at') } }],
    },
  });
};

/** Present on the Postgres query interface; the base typing omits it. */
type PostgresQueryInterface = QueryInterface & {
  dropEnum(enumName: string): Promise<void>;
};

export const down: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.dropTable('event_occurrences');
  await queryInterface.dropTable('events');
  await queryInterface.dropTable('venues');
  for (const type of [
    'enum_event_occurrences_status',
    'enum_events_status',
    'enum_events_category',
  ]) {
    await (queryInterface as PostgresQueryInterface).dropEnum(type);
  }
};

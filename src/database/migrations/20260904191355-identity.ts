import {
  DataTypes,
  Op,
  col,
  fn,
  literal,
  type QueryInterface,
} from 'sequelize';
import type { MigrationFn } from 'umzug';

/**
 * Identity: `users`, `user_identities`, `profiles`, `privacy_settings`.
 * A port of the first Drizzle migration, so an existing database is adopted
 * as applied by `migrate.ts` rather than rebuilt.
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

const ownerId = {
  allowNull: false,
  onDelete: 'CASCADE',
  onUpdate: 'NO ACTION',
  references: { key: 'id', model: 'users' },
  type: DataTypes.UUID,
};

const audience = (defaultValue: string) => ({
  allowNull: false,
  defaultValue,
  type: DataTypes.ENUM('nobody', 'friends', 'everyone'),
});

export const up: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  // Sequelize has no API for extensions; these are the only raw statements.
  for (const extension of ['postgis', 'pg_trgm', 'unaccent']) {
    await queryInterface.sequelize.query(
      `CREATE EXTENSION IF NOT EXISTS ${extension}`,
    );
  }

  await queryInterface.createTable('users', {
    id: generatedId,
    status: {
      allowNull: false,
      defaultValue: 'active',
      type: DataTypes.ENUM('active', 'suspended', 'deleted'),
    },
    ...stamps,
    deleted_at: DataTypes.DATE,
  });
  await queryInterface.addIndex('users', {
    fields: ['status'],
    name: 'users_status_idx',
  });

  await queryInterface.createTable('user_identities', {
    id: generatedId,
    user_id: ownerId,
    issuer: { allowNull: false, type: DataTypes.STRING(32) },
    subject: { allowNull: false, type: DataTypes.STRING(255) },
    sign_in_provider: DataTypes.STRING(64),
    email: DataTypes.TEXT,
    email_verified: {
      allowNull: false,
      defaultValue: false,
      type: DataTypes.BOOLEAN,
    },
    phone_e164: DataTypes.STRING(20),
    ...stamps,
    last_authenticated_at: {
      allowNull: false,
      defaultValue: literal('now()'),
      type: DataTypes.DATE,
    },
  });
  await queryInterface.addIndex('user_identities', {
    fields: ['issuer', 'subject'],
    name: 'user_identities_issuer_subject_uq',
    unique: true,
  });
  await queryInterface.addIndex('user_identities', {
    fields: ['user_id'],
    name: 'user_identities_user_id_idx',
  });
  await queryInterface.addConstraint('user_identities', {
    fields: ['email', 'phone_e164'],
    name: 'user_identities_contact_ck',
    type: 'check',
    where: {
      [Op.or]: [
        { email: { [Op.ne]: null } },
        { phone_e164: { [Op.ne]: null } },
      ],
    },
  });

  await queryInterface.createTable('profiles', {
    user_id: { ...ownerId, primaryKey: true },
    display_name: { allowNull: false, type: DataTypes.STRING(80) },
    username: DataTypes.STRING(30),
    bio: DataTypes.STRING(300),
    avatar_url: DataTypes.TEXT,
    ...stamps,
  });
  // Case-insensitive uniqueness: `Sam` and `sam` are one name.
  await queryInterface.addIndex('profiles', {
    fields: [fn('lower', col('username'))],
    name: 'profiles_username_lower_uq',
    unique: true,
  });
  await queryInterface.addConstraint('profiles', {
    fields: ['username'],
    name: 'profiles_username_format_ck',
    type: 'check',
    where: {
      [Op.or]: [
        { username: null },
        { username: { [Op.regexp]: '^[a-z0-9_]{3,30}$' } },
      ],
    },
  });

  await queryInterface.createTable('privacy_settings', {
    user_id: { ...ownerId, primaryKey: true },
    profile_visibility: audience('everyone'),
    presence_visibility: audience('nobody'),
    moments_visibility: audience('friends'),
    ...stamps,
  });
};

/** Present on the Postgres query interface; the base typing omits it. */
type PostgresQueryInterface = QueryInterface & {
  dropEnum(enumName: string): Promise<void>;
};

export const down: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.dropTable('privacy_settings');
  await queryInterface.dropTable('profiles');
  await queryInterface.dropTable('user_identities');
  await queryInterface.dropTable('users');
  for (const type of [
    'enum_privacy_settings_profile_visibility',
    'enum_privacy_settings_presence_visibility',
    'enum_privacy_settings_moments_visibility',
    'enum_users_status',
  ]) {
    await (queryInterface as PostgresQueryInterface).dropEnum(type);
  }
};

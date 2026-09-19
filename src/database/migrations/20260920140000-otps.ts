import { DataTypes, literal, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

/**
 * `otps` is the code in flight; `otp_verifications` is the permanent record of
 * one being used. They are split because their lifetimes differ: a code is
 * disposable and purged once it expires, while the history of who signed in
 * has to outlive it.
 *
 * The code itself is never stored. `code_hash` is an HMAC keyed with a
 * server-side secret, because six digits is a million candidates and a plain
 * hash of a leaked table would fall in seconds.
 */
export const up: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.createTable('otps', {
    id: {
      allowNull: false,
      defaultValue: literal('gen_random_uuid()'),
      primaryKey: true,
      type: DataTypes.UUID,
    },
    // Named to match `user_identities.phone_e164`, so the join to the account
    // that owns this number is obvious from the column alone.
    phone_e164: { allowNull: false, type: DataTypes.STRING(20) },
    code_hash: { allowNull: false, type: DataTypes.TEXT },
    expires_at: { allowNull: false, type: DataTypes.DATE },
    /** Counted so a guessed code runs out of tries long before the space does. */
    attempt_count: {
      allowNull: false,
      defaultValue: 0,
      type: DataTypes.INTEGER,
    },
    /** Set once, atomically: the soft delete that makes a code single-use. */
    consumed_at: DataTypes.DATE,
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
  });
  // The only hot query: the live code for one number.
  await queryInterface.addIndex('otps', {
    fields: ['phone_e164', 'expires_at'],
    name: 'otps_phone_expires_idx',
  });

  await queryInterface.createTable('otp_verifications', {
    id: {
      allowNull: false,
      defaultValue: literal('gen_random_uuid()'),
      primaryKey: true,
      type: DataTypes.UUID,
    },
    /**
     * Null when the code was verified during sign-up, before an account
     * existed. The row still records that the number proved itself.
     */
    user_id: {
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
      references: { key: 'id', model: 'users' },
      type: DataTypes.UUID,
    },
    /**
     * `SET NULL`, not `CASCADE`: purging an expired code must not erase the
     * history of it having been used. `phone_e164` keeps the row readable on
     * its own once the link is gone.
     */
    otp_id: {
      onDelete: 'SET NULL',
      onUpdate: 'NO ACTION',
      references: { key: 'id', model: 'otps' },
      type: DataTypes.UUID,
    },
    phone_e164: { allowNull: false, type: DataTypes.STRING(20) },
    verified_at: {
      allowNull: false,
      defaultValue: literal('now()'),
      type: DataTypes.DATE,
    },
    ip: DataTypes.INET,
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
  });
  await queryInterface.addIndex('otp_verifications', {
    fields: ['phone_e164', 'verified_at'],
    name: 'otp_verifications_phone_verified_idx',
  });
  await queryInterface.addIndex('otp_verifications', {
    fields: ['user_id'],
    name: 'otp_verifications_user_id_idx',
  });

  // Resolving a verified number to its account is the step between the two
  // tables above, and `user_identities` had no index on the phone column.
  await queryInterface.addIndex('user_identities', {
    fields: ['phone_e164'],
    name: 'user_identities_phone_e164_idx',
  });
};

export const down: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.removeIndex(
    'user_identities',
    'user_identities_phone_e164_idx',
  );
  await queryInterface.dropTable('otp_verifications');
  await queryInterface.dropTable('otps');
};

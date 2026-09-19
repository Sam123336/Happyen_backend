import { DataTypes, literal, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

/**
 * Refresh tokens are opaque random strings, not JWTs, because the one thing a
 * refresh token must support is revocation and a self-contained token cannot
 * be revoked without a table like this anyway.
 *
 * Only the SHA-256 of the token is stored. Unlike the six-digit OTP, which
 * needs a keyed HMAC because a million candidates fall instantly, this is 256
 * bits of entropy: a plain digest is not brute-forceable.
 */
export const up: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.createTable('refresh_tokens', {
    id: {
      allowNull: false,
      defaultValue: literal('gen_random_uuid()'),
      primaryKey: true,
      type: DataTypes.UUID,
    },
    user_id: {
      allowNull: false,
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
      references: { key: 'id', model: 'users' },
      type: DataTypes.UUID,
    },
    token_hash: { allowNull: false, type: DataTypes.TEXT },
    expires_at: { allowNull: false, type: DataTypes.DATE },
    revoked_at: DataTypes.DATE,
    /**
     * The rotation chain. A token presented after it was replaced is a stolen
     * one being reused, and this is what makes that detectable.
     */
    replaced_by_id: {
      onDelete: 'SET NULL',
      onUpdate: 'NO ACTION',
      references: { key: 'id', model: 'refresh_tokens' },
      type: DataTypes.UUID,
    },
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

  // Every refresh is a lookup by hash, and no two tokens may share one.
  await queryInterface.addIndex('refresh_tokens', {
    fields: ['token_hash'],
    name: 'refresh_tokens_token_hash_uq',
    unique: true,
  });
  // Revoking a whole family on reuse walks every token for the account.
  await queryInterface.addIndex('refresh_tokens', {
    fields: ['user_id'],
    name: 'refresh_tokens_user_id_idx',
  });
};

export const down: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.dropTable('refresh_tokens');
};

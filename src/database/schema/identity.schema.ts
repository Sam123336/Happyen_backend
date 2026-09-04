import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const userStatus = pgEnum('user_status', [
  'active',
  'suspended',
  'deleted',
]);
export const privacyAudience = pgEnum('privacy_audience', [
  'nobody',
  'friends',
  'everyone',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    status: userStatus('status').default('active').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [index('users_status_idx').on(table.status)],
);

export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuer: varchar('issuer', { length: 32 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    signInProvider: varchar('sign_in_provider', { length: 64 }),
    email: text('email'),
    emailVerified: boolean('email_verified').default(false).notNull(),
    phoneE164: varchar('phone_e164', { length: 20 }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    lastAuthenticatedAt: timestamp('last_authenticated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('user_identities_issuer_subject_uq').on(
      table.issuer,
      table.subject,
    ),
    index('user_identities_user_id_idx').on(table.userId),
    check(
      'user_identities_contact_ck',
      sql`${table.email} IS NOT NULL OR ${table.phoneE164} IS NOT NULL`,
    ),
  ],
);

export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    username: varchar('username', { length: 30 }),
    bio: varchar('bio', { length: 300 }),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('profiles_username_lower_uq').on(sql`lower(${table.username})`),
    check(
      'profiles_username_format_ck',
      sql`${table.username} IS NULL OR ${table.username} ~ '^[a-z0-9_]{3,30}$'`,
    ),
  ],
);

export const privacySettings = pgTable('privacy_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  profileVisibility: privacyAudience('profile_visibility')
    .default('everyone')
    .notNull(),
  presenceVisibility: privacyAudience('presence_visibility')
    .default('nobody')
    .notNull(),
  momentsVisibility: privacyAudience('moments_visibility')
    .default('friends')
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  identities: many(userIdentities),
  privacySettings: one(privacySettings),
  profile: one(profiles),
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, {
    fields: [userIdentities.userId],
    references: [users.id],
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));

export const privacySettingsRelations = relations(
  privacySettings,
  ({ one }) => ({
    user: one(users, {
      fields: [privacySettings.userId],
      references: [users.id],
    }),
  }),
);

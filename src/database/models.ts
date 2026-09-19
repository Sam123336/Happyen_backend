import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';

import type { EventCategory } from '../events/event.types.js';
import type { PrivacyAudience } from '../users/user.types.js';

export type UserStatus = 'active' | 'suspended' | 'deleted';
export type EventStatus = 'draft' | 'published' | 'cancelled';

/**
 * GeoJSON, which is how Sequelize reads and writes a PostGIS `geography`:
 * `ST_GeomFromGeoJSON` on the way in, WKB parsed back out on the way back.
 * Longitude first, as GeoJSON has it.
 */
export interface GeoPoint {
  coordinates: [longitude: number, latitude: number];
  type: 'Point';
}

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<string>;
  declare status: CreationOptional<UserStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;

  declare identities?: NonAttribute<UserIdentity[]>;
  declare privacySettings?: NonAttribute<PrivacySettings>;
  declare profile?: NonAttribute<Profile>;
}

/** Provider subject IDs live here; domain tables reference the internal id. */
export class UserIdentity extends Model<
  InferAttributes<UserIdentity>,
  InferCreationAttributes<UserIdentity>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare issuer: string;
  declare subject: string;
  declare signInProvider: CreationOptional<string | null>;
  declare email: CreationOptional<string | null>;
  declare emailVerified: CreationOptional<boolean>;
  declare phoneE164: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastAuthenticatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
}

export class Profile extends Model<
  InferAttributes<Profile>,
  InferCreationAttributes<Profile>
> {
  declare userId: string;
  declare displayName: string;
  declare username: CreationOptional<string | null>;
  declare bio: CreationOptional<string | null>;
  declare avatarUrl: CreationOptional<string | null>;
  /**
   * Days in a row the account has opened the city, advanced once per local
   * calendar day by `POST /auth/session`. The day is the phone's, because
   * the server cannot know what "today" is where the person stands.
   * ponytail: counts app opens; move to verified visits once presence exists.
   */
  declare streakDays: CreationOptional<number>;
  declare streakLastActiveOn: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class PrivacySettings extends Model<
  InferAttributes<PrivacySettings>,
  InferCreationAttributes<PrivacySettings>
> {
  declare userId: string;
  declare profileVisibility: CreationOptional<PrivacyAudience>;
  declare presenceVisibility: CreationOptional<PrivacyAudience>;
  declare momentsVisibility: CreationOptional<PrivacyAudience>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Venue extends Model<
  InferAttributes<Venue>,
  InferCreationAttributes<Venue>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare address: CreationOptional<string | null>;
  /**
   * Set when the venue was first matched from Foursquare. Provenance only —
   * Happyen's row stays the source of truth, because the Foursquare licence
   * forbids building an offering competitive with theirs on their data.
   */
  declare foursquarePlaceId: CreationOptional<string | null>;
  declare location: GeoPoint;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

/** A sign-in code in flight. Holds the HMAC of the code, never the code. */
export class Otp extends Model<
  InferAttributes<Otp>,
  InferCreationAttributes<Otp>
> {
  declare id: CreationOptional<string>;
  declare phoneE164: string;
  declare codeHash: string;
  declare expiresAt: Date;
  declare attemptCount: CreationOptional<number>;
  declare consumedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

/**
 * The permanent record of a code being used. Outlives the `otps` row, which is
 * purged once it expires, so `phoneE164` is kept here rather than joined.
 */
export class OtpVerification extends Model<
  InferAttributes<OtpVerification>,
  InferCreationAttributes<OtpVerification>
> {
  declare id: CreationOptional<string>;
  /** Null when the code was verified at sign-up, before an account existed. */
  declare userId: CreationOptional<string | null>;
  declare otpId: CreationOptional<string | null>;
  declare phoneE164: string;
  declare verifiedAt: CreationOptional<Date>;
  declare ip: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

/**
 * An opaque refresh token, stored only as a digest. `replacedById` is the
 * rotation chain: a token presented after it was replaced has been stolen.
 */
export class RefreshToken extends Model<
  InferAttributes<RefreshToken>,
  InferCreationAttributes<RefreshToken>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare revokedAt: CreationOptional<Date | null>;
  declare replacedById: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

/** The canonical concept: "Bangalore Comedy Night", not one of its nights. */
export class Event extends Model<
  InferAttributes<Event>,
  InferCreationAttributes<Event>
> {
  declare id: CreationOptional<string>;
  declare title: string;
  declare description: CreationOptional<string | null>;
  declare category: CreationOptional<EventCategory>;
  declare status: CreationOptional<EventStatus>;
  declare heroImageUrl: CreationOptional<string | null>;
  /** External ticketing lives off-platform; Happyen only links out. */
  declare ticketUrl: CreationOptional<string | null>;
  /** The feed this came from, null for events Happyen owns outright. */
  declare source: CreationOptional<string | null>;
  declare sourceId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare occurrences?: NonAttribute<EventOccurrence[]>;
}

/**
 * One actual instance, with a location snapshot. The snapshot is deliberate:
 * history stays true when a venue moves or is corrected, and discovery never
 * has to join through a mutable address.
 */
export class EventOccurrence extends Model<
  InferAttributes<EventOccurrence>,
  InferCreationAttributes<EventOccurrence>
> {
  declare id: CreationOptional<string>;
  declare eventId: string;
  declare venueId: CreationOptional<string | null>;
  declare venueName: string;
  declare location: GeoPoint;
  declare startAt: Date;
  declare endAt: CreationOptional<Date | null>;
  declare status: CreationOptional<EventStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare event?: NonAttribute<Event>;
  declare venue?: NonAttribute<Venue>;
}

const userStatuses: UserStatus[] = ['active', 'suspended', 'deleted'];
const audiences: PrivacyAudience[] = ['nobody', 'friends', 'everyone'];
const eventCategories: EventCategory[] = [
  'music',
  'comedy',
  'food',
  'pets',
  'sports',
  'other',
];
const eventStatuses: EventStatus[] = ['draft', 'published', 'cancelled'];

/**
 * Binds every model to one connection. Column names come from `underscored`,
 * so `displayName` is `display_name`; the schema itself is owned by the
 * migrations, never by `sync()`.
 */
export function initModels(sequelize: Sequelize): void {
  const table = { sequelize, timestamps: true, underscored: true };
  const uuid = {
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    type: DataTypes.UUID,
  };
  const stamps = { createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE };
  const audience = (defaultValue: PrivacyAudience) => ({
    allowNull: false,
    defaultValue,
    type: DataTypes.ENUM(...audiences),
  });

  User.init(
    {
      id: uuid,
      status: {
        allowNull: false,
        defaultValue: 'active',
        type: DataTypes.ENUM(...userStatuses),
      },
      ...stamps,
      deletedAt: DataTypes.DATE,
    },
    { ...table, tableName: 'users' },
  );

  UserIdentity.init(
    {
      id: uuid,
      userId: { allowNull: false, type: DataTypes.UUID },
      issuer: { allowNull: false, type: DataTypes.STRING(32) },
      subject: { allowNull: false, type: DataTypes.STRING(255) },
      signInProvider: DataTypes.STRING(64),
      email: DataTypes.TEXT,
      emailVerified: {
        allowNull: false,
        defaultValue: false,
        type: DataTypes.BOOLEAN,
      },
      phoneE164: DataTypes.STRING(20),
      ...stamps,
      lastAuthenticatedAt: {
        allowNull: false,
        defaultValue: DataTypes.NOW,
        type: DataTypes.DATE,
      },
    },
    { ...table, tableName: 'user_identities' },
  );

  Otp.init(
    {
      id: uuid,
      phoneE164: { allowNull: false, type: DataTypes.STRING(20) },
      codeHash: { allowNull: false, type: DataTypes.TEXT },
      expiresAt: { allowNull: false, type: DataTypes.DATE },
      attemptCount: {
        allowNull: false,
        defaultValue: 0,
        type: DataTypes.INTEGER,
      },
      consumedAt: DataTypes.DATE,
      ...stamps,
    },
    { ...table, tableName: 'otps' },
  );

  OtpVerification.init(
    {
      id: uuid,
      userId: DataTypes.UUID,
      otpId: DataTypes.UUID,
      phoneE164: { allowNull: false, type: DataTypes.STRING(20) },
      verifiedAt: {
        allowNull: false,
        defaultValue: DataTypes.NOW,
        type: DataTypes.DATE,
      },
      ip: DataTypes.INET,
      ...stamps,
    },
    { ...table, tableName: 'otp_verifications' },
  );

  RefreshToken.init(
    {
      id: uuid,
      userId: { allowNull: false, type: DataTypes.UUID },
      tokenHash: { allowNull: false, type: DataTypes.TEXT },
      expiresAt: { allowNull: false, type: DataTypes.DATE },
      revokedAt: DataTypes.DATE,
      replacedById: DataTypes.UUID,
      ...stamps,
    },
    { ...table, tableName: 'refresh_tokens' },
  );

  Profile.init(
    {
      userId: { primaryKey: true, type: DataTypes.UUID },
      displayName: { allowNull: false, type: DataTypes.STRING(80) },
      username: DataTypes.STRING(30),
      bio: DataTypes.STRING(300),
      avatarUrl: DataTypes.TEXT,
      streakDays: {
        allowNull: false,
        defaultValue: 0,
        type: DataTypes.INTEGER,
      },
      streakLastActiveOn: DataTypes.DATEONLY,
      ...stamps,
    },
    { ...table, tableName: 'profiles' },
  );

  PrivacySettings.init(
    {
      userId: { primaryKey: true, type: DataTypes.UUID },
      profileVisibility: audience('everyone'),
      presenceVisibility: audience('nobody'),
      momentsVisibility: audience('friends'),
      ...stamps,
    },
    { ...table, tableName: 'privacy_settings' },
  );

  Venue.init(
    {
      id: uuid,
      name: { allowNull: false, type: DataTypes.STRING(160) },
      address: DataTypes.TEXT,
      foursquarePlaceId: DataTypes.STRING(64),
      location: {
        allowNull: false,
        type: DataTypes.GEOGRAPHY('POINT', 4326),
      },
      ...stamps,
    },
    { ...table, tableName: 'venues' },
  );

  Event.init(
    {
      id: uuid,
      title: { allowNull: false, type: DataTypes.STRING(200) },
      description: DataTypes.TEXT,
      category: {
        allowNull: false,
        defaultValue: 'other',
        type: DataTypes.ENUM(...eventCategories),
      },
      status: {
        allowNull: false,
        defaultValue: 'draft',
        type: DataTypes.ENUM(...eventStatuses),
      },
      heroImageUrl: DataTypes.TEXT,
      ticketUrl: DataTypes.TEXT,
      source: DataTypes.STRING(32),
      sourceId: DataTypes.STRING(128),
      ...stamps,
    },
    { ...table, tableName: 'events' },
  );

  EventOccurrence.init(
    {
      id: uuid,
      eventId: { allowNull: false, type: DataTypes.UUID },
      venueId: DataTypes.UUID,
      venueName: { allowNull: false, type: DataTypes.STRING(160) },
      location: {
        allowNull: false,
        type: DataTypes.GEOGRAPHY('POINT', 4326),
      },
      startAt: { allowNull: false, type: DataTypes.DATE },
      endAt: DataTypes.DATE,
      status: {
        allowNull: false,
        defaultValue: 'draft',
        type: DataTypes.ENUM(...eventStatuses),
      },
      ...stamps,
    },
    { ...table, tableName: 'event_occurrences' },
  );

  User.hasMany(UserIdentity, { as: 'identities', foreignKey: 'userId' });
  User.hasOne(Profile, { as: 'profile', foreignKey: 'userId' });
  User.hasOne(PrivacySettings, {
    as: 'privacySettings',
    foreignKey: 'userId',
  });
  UserIdentity.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  Event.hasMany(EventOccurrence, { as: 'occurrences', foreignKey: 'eventId' });
  EventOccurrence.belongsTo(Event, { as: 'event', foreignKey: 'eventId' });
  EventOccurrence.belongsTo(Venue, { as: 'venue', foreignKey: 'venueId' });
}

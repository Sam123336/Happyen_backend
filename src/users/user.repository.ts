import { ConflictException, Injectable } from '@nestjs/common';
import { UniqueConstraintError, col, fn, where as sqlWhere } from 'sequelize';

import type { ExternalIdentity } from '../auth/external-identity.js';
import { DatabaseService } from '../database/database.service.js';
import {
  PrivacySettings,
  Profile,
  User,
  UserIdentity,
} from '../database/models.js';
import { advanceStreak } from './streak.js';
import type {
  UpdatePrivacyInput,
  UpdateProfileInput,
  UserProfileView,
} from './user.types.js';

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/** A field left out must stay as it is; `undefined` would be written as NULL. */
function defined<T extends object>(input: T): Defined<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Defined<T>;
}

@Injectable()
export class UserRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async findByIdentity(
    identity: ExternalIdentity,
  ): Promise<UserProfileView | null> {
    const found = await UserIdentity.findOne({
      attributes: ['userId'],
      where: { issuer: identity.issuer, subject: identity.subject },
    });

    return found === null ? null : this.findByUserId(found.userId);
  }

  /**
   * The account behind an external identity, created on first sight. Every
   * call also counts as opening the city on `activeOn`, which is what the
   * streak measures.
   */
  public async provision(
    identity: ExternalIdentity,
    activeOn: string,
  ): Promise<UserProfileView> {
    const existing = await this.findByIdentity(identity);
    if (existing !== null) {
      await this.refreshIdentity(identity);
      await this.recordActivity(existing.userId, activeOn);
      return (await this.findByUserId(existing.userId)) ?? existing;
    }

    try {
      const userId = await this.database.sequelize.transaction(
        async (transaction) => {
          const user = await User.create({}, { transaction });
          await UserIdentity.create(
            {
              email: identity.email ?? null,
              emailVerified: identity.emailVerified,
              issuer: identity.issuer,
              phoneE164: identity.phoneE164 ?? null,
              signInProvider: identity.signInProvider ?? null,
              subject: identity.subject,
              userId: user.id,
            },
            { transaction },
          );
          await Profile.create(
            {
              avatarUrl: identity.avatarUrl ?? null,
              displayName: this.defaultDisplayName(identity),
              streakDays: 1,
              streakLastActiveOn: activeOn,
              userId: user.id,
            },
            { transaction },
          );
          await PrivacySettings.create({ userId: user.id }, { transaction });

          return user.id;
        },
      );

      const provisioned = await this.findByUserId(userId);
      if (provisioned === null) {
        throw new Error('Provisioned user could not be loaded');
      }
      return provisioned;
    } catch (error: unknown) {
      if (error instanceof UniqueConstraintError) {
        const concurrent = await this.findByIdentity(identity);
        if (concurrent !== null) {
          return concurrent;
        }
      }
      throw error;
    }
  }

  /**
   * Whether [username] is free to claim. Case-insensitive, matching the
   * `profiles_username_lower_uq` index, so `Sam` and `sam` are one name.
   *
   * This is advisory only: two people can pass this check for the same name in
   * the same instant, which is why [updateProfile] still has to survive the
   * unique violation rather than trusting the answer.
   */
  public async isUsernameAvailable(username: string): Promise<boolean> {
    const taken = await Profile.count({
      where: sqlWhere(fn('lower', col('username')), username.toLowerCase()),
    });

    return taken === 0;
  }

  public async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<UserProfileView | null> {
    try {
      await Profile.update(
        defined({
          bio: input.bio,
          displayName: input.displayName,
          username:
            input.username === undefined
              ? undefined
              : (input.username?.toLowerCase() ?? null),
        }),
        { where: { userId } },
      );
    } catch (error: unknown) {
      // Two people claiming one name race past isUsernameAvailable; the
      // unique index is what actually decides, so report the loser honestly
      // instead of letting a 23505 surface as an internal error.
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException({
          code: 'username_taken',
          message: 'That username is already taken',
        });
      }
      throw error;
    }

    return this.findByUserId(userId);
  }

  public async updatePrivacy(
    userId: string,
    input: UpdatePrivacyInput,
  ): Promise<UserProfileView | null> {
    await PrivacySettings.update(defined(input), { where: { userId } });

    return this.findByUserId(userId);
  }

  private async findByUserId(userId: string): Promise<UserProfileView | null> {
    const user = await User.findByPk(userId, {
      include: ['identities', 'privacySettings', 'profile'],
    });
    const profile = user?.profile;
    const privacy = user?.privacySettings;
    const identity = user?.identities?.[0];
    if (
      user === null ||
      profile === undefined ||
      privacy === undefined ||
      identity === undefined
    ) {
      return null;
    }

    return {
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      displayName: profile.displayName,
      email: identity.email,
      emailVerified: identity.emailVerified,
      momentsVisibility: privacy.momentsVisibility,
      phoneE164: identity.phoneE164,
      presenceVisibility: privacy.presenceVisibility,
      profileVisibility: privacy.profileVisibility,
      status: user.status,
      streakDays: profile.streakDays,
      streakLastActiveOn: profile.streakLastActiveOn,
      userId: user.id,
      username: profile.username,
    };
  }

  /**
   * Read-modify-write rather than a SQL CASE so the rule lives in one tested
   * function. Two sessions racing on the same day both land on the same
   * answer, so the race is harmless.
   */
  private async recordActivity(
    userId: string,
    activeOn: string,
  ): Promise<void> {
    const current = await Profile.findByPk(userId, {
      attributes: ['streakDays', 'streakLastActiveOn'],
    });
    if (current === null) {
      return;
    }

    const next = advanceStreak(current, activeOn);
    if (next === current) {
      return;
    }
    await Profile.update(next, { where: { userId } });
  }

  private async refreshIdentity(identity: ExternalIdentity): Promise<void> {
    await UserIdentity.update(
      {
        ...defined({
          email: identity.email,
          phoneE164: identity.phoneE164,
          signInProvider: identity.signInProvider,
        }),
        emailVerified: identity.emailVerified,
        lastAuthenticatedAt: new Date(),
      },
      { where: { issuer: identity.issuer, subject: identity.subject } },
    );
  }

  private defaultDisplayName(identity: ExternalIdentity): string {
    if (
      identity.displayName !== undefined &&
      identity.displayName.trim().length > 0
    ) {
      return identity.displayName.trim().slice(0, 80);
    }
    if (identity.email !== undefined) {
      return identity.email.split('@')[0]?.slice(0, 80) || 'Happyn member';
    }
    return 'Happyn member';
  }
}

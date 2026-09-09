import { ConflictException, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { ExternalIdentity } from '../auth/external-identity.js';
import { DatabaseService } from '../database/database.service.js';
import {
  privacySettings,
  profiles,
  userIdentities,
  users,
} from '../database/schema/index.js';
import type {
  UpdatePrivacyInput,
  UpdateProfileInput,
  UserProfileView,
} from './user.types.js';

@Injectable()
export class UserRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async findByIdentity(
    identity: ExternalIdentity,
  ): Promise<UserProfileView | null> {
    const [result] = await this.database.client
      .select(this.selection())
      .from(userIdentities)
      .innerJoin(users, eq(userIdentities.userId, users.id))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .innerJoin(privacySettings, eq(privacySettings.userId, users.id))
      .where(
        and(
          eq(userIdentities.issuer, identity.issuer),
          eq(userIdentities.subject, identity.subject),
        ),
      )
      .limit(1);

    return result ?? null;
  }

  public async provision(identity: ExternalIdentity): Promise<UserProfileView> {
    const existing = await this.findByIdentity(identity);
    if (existing !== null) {
      await this.refreshIdentity(identity);
      return (await this.findByUserId(existing.userId)) ?? existing;
    }

    try {
      const userId = await this.database.client.transaction(
        async (transaction) => {
          const [user] = await transaction
            .insert(users)
            .values({})
            .returning({ id: users.id });
          if (user === undefined) {
            throw new Error('User provisioning did not return an identifier');
          }

          await transaction.insert(userIdentities).values({
            email: identity.email ?? null,
            emailVerified: identity.emailVerified,
            issuer: identity.issuer,
            phoneE164: identity.phoneE164 ?? null,
            signInProvider: identity.signInProvider ?? null,
            subject: identity.subject,
            userId: user.id,
          });
          await transaction.insert(profiles).values({
            avatarUrl: identity.avatarUrl ?? null,
            displayName: this.defaultDisplayName(identity),
            userId: user.id,
          });
          await transaction.insert(privacySettings).values({ userId: user.id });

          return user.id;
        },
      );

      const provisioned = await this.findByUserId(userId);
      if (provisioned === null) {
        throw new Error('Provisioned user could not be loaded');
      }
      return provisioned;
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
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
    const [taken] = await this.database.client
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(sql`lower(${profiles.username}) = lower(${username})`)
      .limit(1);

    return taken === undefined;
  }

  public async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<UserProfileView | null> {
    await this.database.client
      .update(profiles)
      .set({
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
        ...(input.username !== undefined
          ? { username: input.username?.toLowerCase() ?? null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, userId))
      .catch((error: unknown) => {
        // Two people claiming one name race past isUsernameAvailable; the
        // unique index is what actually decides, so report the loser honestly
        // instead of letting a 23505 surface as an internal error.
        if (this.isUniqueViolation(error)) {
          throw new ConflictException({
            code: 'username_taken',
            message: 'That username is already taken',
          });
        }
        throw error;
      });

    return this.findByUserId(userId);
  }

  public async updatePrivacy(
    userId: string,
    input: UpdatePrivacyInput,
  ): Promise<UserProfileView | null> {
    await this.database.client
      .update(privacySettings)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(privacySettings.userId, userId));

    return this.findByUserId(userId);
  }

  private async findByUserId(userId: string): Promise<UserProfileView | null> {
    const [result] = await this.database.client
      .select(this.selection())
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .innerJoin(privacySettings, eq(privacySettings.userId, users.id))
      .innerJoin(userIdentities, eq(userIdentities.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    return result ?? null;
  }

  private async refreshIdentity(identity: ExternalIdentity): Promise<void> {
    await this.database.client
      .update(userIdentities)
      .set({
        ...(identity.email !== undefined ? { email: identity.email } : {}),
        emailVerified: identity.emailVerified,
        lastAuthenticatedAt: new Date(),
        ...(identity.phoneE164 !== undefined
          ? { phoneE164: identity.phoneE164 }
          : {}),
        ...(identity.signInProvider !== undefined
          ? { signInProvider: identity.signInProvider }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userIdentities.issuer, identity.issuer),
          eq(userIdentities.subject, identity.subject),
        ),
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

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }

  private selection() {
    return {
      avatarUrl: profiles.avatarUrl,
      bio: profiles.bio,
      displayName: profiles.displayName,
      email: userIdentities.email,
      emailVerified: userIdentities.emailVerified,
      momentsVisibility: privacySettings.momentsVisibility,
      phoneE164: userIdentities.phoneE164,
      presenceVisibility: privacySettings.presenceVisibility,
      profileVisibility: privacySettings.profileVisibility,
      status: users.status,
      userId: users.id,
      username: profiles.username,
    };
  }
}

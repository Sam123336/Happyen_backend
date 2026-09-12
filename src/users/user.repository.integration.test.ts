import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createSequelize,
  DatabaseService,
} from '../database/database.service.js';
import { User } from '../database/models.js';
import { UserRepository } from './user.repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase =
  databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase('UserRepository integration', () => {
  // The suite body still runs when skipped; a placeholder URL is never opened.
  const database = new DatabaseService(
    createSequelize(databaseUrl ?? 'postgresql://localhost/skipped', {
      poolMax: 1,
    }),
  );
  const repository = new UserRepository(database);
  let provisionedUserId: string | undefined;

  beforeAll(async () => {
    await database.ping();
  });

  afterAll(async () => {
    if (provisionedUserId !== undefined) {
      await User.destroy({ where: { id: provisionedUserId } });
    }
    await database.sequelize.close();
  });

  it('provisions safe privacy defaults and updates a normalized profile', async () => {
    const identity = {
      displayName: 'City Explorer',
      email: `test-${randomUUID()}@example.com`,
      emailVerified: true,
      issuer: 'supabase' as const,
      signInProvider: 'google.com',
      subject: randomUUID(),
    };

    const provisioned = await repository.provision(identity, '2026-09-12');
    provisionedUserId = provisioned.userId;

    expect(provisioned).toMatchObject({
      displayName: 'City Explorer',
      streakDays: 1,
      streakLastActiveOn: '2026-09-12',
      momentsVisibility: 'friends',
      presenceVisibility: 'nobody',
      profileVisibility: 'everyone',
      status: 'active',
    });

    const updated = await repository.updateProfile(provisioned.userId, {
      bio: 'Finding the city as it happens.',
      username: 'CITY_EXPLORER',
    });
    expect(updated).toMatchObject({
      bio: 'Finding the city as it happens.',
      username: 'city_explorer',
    });

    const reprovisioned = await repository.provision(
      {
        ...identity,
        displayName: 'Ignored Provider Refresh',
      },
      '2026-09-13',
    );
    // The day after the first opening: the streak grows instead of resetting.
    expect(reprovisioned.streakDays).toBe(2);
    expect(reprovisioned.userId).toBe(provisioned.userId);
    expect(reprovisioned.username).toBe('city_explorer');
  });
});

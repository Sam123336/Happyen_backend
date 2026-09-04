import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import * as schema from '../database/schema/index.js';
import { users } from '../database/schema/index.js';
import { UserRepository } from './user.repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase =
  databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase('UserRepository integration', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new UserRepository(
    new DatabaseService(drizzle(pool, { schema }), pool),
  );
  let provisionedUserId: string | undefined;

  beforeAll(async () => {
    await pool.query('select 1');
  });

  afterAll(async () => {
    if (provisionedUserId !== undefined) {
      await drizzle(pool).delete(users).where(eq(users.id, provisionedUserId));
    }
    await pool.end();
  });

  it('provisions safe privacy defaults and updates a normalized profile', async () => {
    const identity = {
      displayName: 'City Explorer',
      email: `test-${randomUUID()}@example.com`,
      emailVerified: true,
      issuer: 'firebase' as const,
      signInProvider: 'google.com',
      subject: randomUUID(),
    };

    const provisioned = await repository.provision(identity);
    provisionedUserId = provisioned.userId;

    expect(provisioned).toMatchObject({
      displayName: 'City Explorer',
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

    const reprovisioned = await repository.provision({
      ...identity,
      displayName: 'Ignored Provider Refresh',
    });
    expect(reprovisioned.userId).toBe(provisioned.userId);
    expect(reprovisioned.username).toBe('city_explorer');
  });
});

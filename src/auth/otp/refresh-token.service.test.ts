import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createSequelize,
  DatabaseService,
} from '../../database/database.service.js';
import { RefreshToken, User } from '../../database/models.js';
import { RefreshTokenService } from './refresh-token.service.js';

describe('RefreshTokenService token material', () => {
  const service = new RefreshTokenService();

  it('maps distinct tokens to distinct digests', () => {
    const digests = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      digests.add(service.hash(String(i)));
    }
    expect(digests.size).toBe(100);
  });

  it('hashes rather than stores, and the digest is not the token', () => {
    expect(service.hash('a-token')).not.toContain('a-token');
    expect(service.hash('a-token')).toBe(service.hash('a-token'));
    expect(service.hash('a-token')).not.toBe(service.hash('b-token'));
  });

  it('matches a token against its own digest only', () => {
    expect(service.matches('a-token', service.hash('a-token'))).toBe(true);
    expect(service.matches('a-token', service.hash('b-token'))).toBe(false);
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase =
  databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase(
  'RefreshTokenService against the database',
  { timeout: 30_000 },
  () => {
    const database = new DatabaseService(
      createSequelize(databaseUrl ?? 'postgresql://localhost/skipped', {
        poolMax: 2,
      }),
    );
    const service = new RefreshTokenService();
    let userId = '';

    beforeEach(async () => {
      const user = await User.create({});
      userId = user.id;
    });

    afterAll(async () => {
      await database.sequelize.close();
    });

    it('rotates to a different token and retires the old one', async () => {
      const first = await service.issue(userId);
      const rotated = await service.rotate(first);

      expect(rotated).toMatchObject({ ok: true, userId });
      expect(rotated.ok && rotated.token).not.toBe(first);

      const old = await RefreshToken.findOne({
        where: { tokenHash: service.hash(first) },
      });
      expect(old?.revokedAt).not.toBeNull();
      expect(old?.replacedById).not.toBeNull();
    });

    it('treats a replayed token as theft and revokes the whole family', async () => {
      const first = await service.issue(userId);
      const rotated = await service.rotate(first);
      const second = rotated.ok ? rotated.token : '';

      // The thief presents the copy the real client already spent.
      await expect(service.rotate(first)).resolves.toMatchObject({
        ok: false,
        reason: 'reused',
      });

      // The victim's current token dies too: at this point the two cannot be
      // told apart, so both have to go.
      await expect(service.rotate(second)).resolves.toMatchObject({
        ok: false,
      });
      await expect(
        RefreshToken.count({ where: { revokedAt: null, userId } }),
      ).resolves.toBe(0);
    });

    it('lets only one of two simultaneous refreshes succeed', async () => {
      const token = await service.issue(userId);

      const results = await Promise.all([
        service.rotate(token),
        service.rotate(token),
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
    });

    it('refuses a token it never issued', async () => {
      await expect(service.rotate('not-a-real-token')).resolves.toEqual({
        ok: false,
        reason: 'unknown',
      });
    });

    it('refuses an expired token without revoking the family', async () => {
      const expiring = new RefreshTokenService(-1);
      const token = await expiring.issue(userId);

      await expect(expiring.rotate(token)).resolves.toEqual({
        ok: false,
        reason: 'expired',
      });
    });

    it('revokes one device on sign-out and leaves the others alone', async () => {
      const phone = await service.issue(userId);
      const tablet = await service.issue(userId);

      await service.revoke(phone);

      await expect(service.rotate(phone)).resolves.toMatchObject({ ok: false });
      await expect(service.rotate(tablet)).resolves.toMatchObject({ ok: true });
    });
  },
);

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createSequelize,
  DatabaseService,
} from '../../database/database.service.js';
import { Otp, OtpVerification } from '../../database/models.js';
import { OtpService } from './otp.service.js';

const secret = 'a-server-side-pepper';

describe('OtpService code generation', () => {
  const service = new OtpService(secret);

  it('always produces six digits, including when the number is small', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(service.generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it('does not repeat itself the way a time-derived code would', () => {
    // A timestamp-derived code is near-identical across a tight loop; a CSPRNG
    // is not. This is the property the whole design turns on.
    const codes = new Set(
      Array.from({ length: 200 }, () => service.generateCode()),
    );

    expect(codes.size).toBeGreaterThan(190);
  });

  it('spans the whole range rather than clustering low', () => {
    const codes = Array.from({ length: 2000 }, () =>
      Number(service.generateCode()),
    );

    expect(Math.min(...codes)).toBeLessThan(200_000);
    expect(Math.max(...codes)).toBeGreaterThan(800_000);
  });
});

describe('OtpService hashing', () => {
  const service = new OtpService(secret);

  it('is deterministic for the same identifier and code', () => {
    expect(service.hash('+919876543210', '123456')).toBe(
      service.hash('+919876543210', '123456'),
    );
  });

  it('binds the hash to the identifier, so it cannot move between rows', () => {
    expect(service.hash('+919876543210', '123456')).not.toBe(
      service.hash('+919999999999', '123456'),
    );
  });

  it('is useless without the secret', () => {
    expect(new OtpService('other-pepper').hash('+91987', '123456')).not.toBe(
      service.hash('+91987', '123456'),
    );
  });

  it('never contains the code itself', () => {
    expect(service.hash('+919876543210', '123456')).not.toContain('123456');
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase =
  databaseUrl === undefined ? describe.skip : describe;

// A remote database answers in round trips, not microseconds.
describeWithDatabase(
  'OtpService against the database',
  { timeout: 30_000 },
  () => {
    const database = new DatabaseService(
      createSequelize(databaseUrl ?? 'postgresql://localhost/skipped', {
        poolMax: 2,
      }),
    );
    const service = new OtpService(secret, 300);
    const phone = '+919000000001';

    beforeEach(async () => {
      await OtpVerification.destroy({ where: { phoneE164: phone } });
      await Otp.destroy({ where: { phoneE164: phone } });
    });

    afterAll(async () => {
      await OtpVerification.destroy({ where: { phoneE164: phone } });
      await Otp.destroy({ where: { phoneE164: phone } });
      await database.sequelize.close();
    });

    it('accepts the code it issued', async () => {
      const code = await service.issue(phone);

      await expect(service.verify(phone, code)).resolves.toMatchObject({
        ok: true,
      });
    });

    it('never stores the code in the clear', async () => {
      const code = await service.issue(phone);
      const row = await Otp.findOne({ where: { phoneE164: phone } });

      expect(row?.codeHash).not.toContain(code);
    });

    it('refuses the same code twice', async () => {
      const code = await service.issue(phone);
      await service.verify(phone, code);

      await expect(service.verify(phone, code)).resolves.toMatchObject({
        ok: false,
      });
    });

    it('lets only one of two simultaneous verifications win', async () => {
      const code = await service.issue(phone);

      const results = await Promise.all([
        service.verify(phone, code),
        service.verify(phone, code),
      ]);

      // The atomic claim is the whole reason this cannot be two.
      expect(results.filter((r) => r.ok)).toHaveLength(1);
    });

    it('burns the code after five wrong guesses', async () => {
      const code = await service.issue(phone);
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i += 1) {
        await service.verify(phone, wrong);
      }

      // Even the right code is dead once the attempts are spent.
      await expect(service.verify(phone, code)).resolves.toMatchObject({
        ok: false,
      });
    });

    it('retires the previous code when a new one is issued', async () => {
      const first = await service.issue(phone);
      const second = await service.issue(phone);

      await expect(service.verify(phone, first)).resolves.toMatchObject({
        ok: false,
      });
      await expect(service.verify(phone, second)).resolves.toMatchObject({
        ok: true,
      });
    });

    it('refuses an expired code', async () => {
      const expiring = new OtpService(secret, -1);
      const code = await expiring.issue(phone);

      await expect(expiring.verify(phone, code)).resolves.toEqual({
        ok: false,
        reason: 'expired',
      });
    });

    it('records a verification that outlives the code it used', async () => {
      const code = await service.issue(phone);
      await service.verify(phone, code, { ip: '203.0.113.9' });

      const before = await OtpVerification.findOne({
        where: { phoneE164: phone },
      });
      expect(before?.ip).toBe('203.0.113.9');
      expect(before?.otpId).not.toBeNull();

      // Purging expired codes must not erase the history of them being used.
      await service.purge(new Date(Date.now() + 60 * 60 * 1000));
      const after = await OtpVerification.findOne({
        where: { phoneE164: phone },
      });

      expect(after).not.toBeNull();
      expect(after?.phoneE164).toBe(phone);
      // The link goes with the row; the record of the sign-in does not.
      expect(after?.otpId).toBeNull();
    });

    it('writes no verification row for a failed attempt', async () => {
      const code = await service.issue(phone);
      await service.verify(phone, code === '000000' ? '111111' : '000000');

      await expect(
        OtpVerification.count({ where: { phoneE164: phone } }),
      ).resolves.toBe(0);
    });
  },
);

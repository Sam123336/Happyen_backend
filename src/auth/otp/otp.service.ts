import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { Op } from 'sequelize';

import { Otp, OtpVerification, UserIdentity } from '../../database/models.js';

/** Six digits is a million candidates; the attempt cap is what defends it. */
const CODE_SPACE = 1_000_000;
const MAX_ATTEMPTS = 5;

export type VerifyOutcome =
  | { ok: true; otpId: string; userId: string | null }
  | { ok: false; reason: 'expired' | 'exhausted' | 'mismatch' | 'none' };

export interface VerifyContext {
  ip?: string;
}

/**
 * A code is random, short-lived, single-use and attempt-capped. Those four
 * together are the security; none of them is optional.
 *
 * It is deliberately NOT derived from a timestamp. A timestamp is unique, not
 * unpredictable: the caller chooses when the code is minted, so a time-derived
 * code has a few thousand candidates rather than a million.
 */
export class OtpService {
  public constructor(
    private readonly secret?: string,
    private readonly ttlSeconds = 300,
  ) {}

  /** Codes keyed with a guessable secret are codes stored in the clear. */
  private pepper(): string {
    if (this.secret === undefined) {
      throw new ServiceUnavailableException({
        code: 'otp_not_configured',
        message: 'OTP_HASH_SECRET is not configured',
      });
    }
    return this.secret;
  }

  /**
   * `randomInt` is the CSPRNG and is uniform over the range. `Math.random()`
   * is predictable, and `% 1_000_000` over a wider random skews the low end.
   */
  public generateCode(): string {
    return String(randomInt(0, CODE_SPACE)).padStart(6, '0');
  }

  /**
   * Keyed with a server-side secret, and bound to the number so a hash lifted
   * from one row cannot be replayed against another.
   */
  public hash(phoneE164: string, code: string): string {
    return createHmac('sha256', this.pepper())
      .update(`${phoneE164}:${code}`)
      .digest('hex');
  }

  /**
   * Issues a code, retiring any live one for the same number first: two valid
   * codes at once would double an attacker's chances for free.
   */
  public async issue(phoneE164: string): Promise<string> {
    const code = this.generateCode();
    await Otp.update(
      { consumedAt: new Date() },
      { where: { consumedAt: null, phoneE164 } },
    );
    await Otp.create({
      codeHash: this.hash(phoneE164, code),
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
      phoneE164,
    });
    return code;
  }

  public async verify(
    phoneE164: string,
    code: string,
    context: VerifyContext = {},
  ): Promise<VerifyOutcome> {
    const otp = await Otp.findOne({
      order: [['createdAt', 'DESC']],
      where: { consumedAt: null, phoneE164 },
    });
    if (otp === null) {
      return { ok: false, reason: 'none' };
    }
    if (otp.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }
    if (otp.attemptCount >= MAX_ATTEMPTS) {
      await otp.update({ consumedAt: new Date() });
      return { ok: false, reason: 'exhausted' };
    }

    if (!equals(this.hash(phoneE164, code), otp.codeHash)) {
      const attemptCount = otp.attemptCount + 1;
      await otp.update({
        attemptCount,
        // Burn it on the last try rather than leaving a dead row usable.
        ...(attemptCount >= MAX_ATTEMPTS ? { consumedAt: new Date() } : {}),
      });
      return { ok: false, reason: 'mismatch' };
    }

    // The claim is the guard: `consumed_at IS NULL` in the WHERE means two
    // concurrent verifications cannot both come back having updated a row.
    const [claimed] = await Otp.update(
      { consumedAt: new Date() },
      { where: { consumedAt: null, id: otp.id } },
    );
    if (claimed !== 1) {
      return { ok: false, reason: 'none' };
    }

    // Null at sign-up, when the number proves itself before an account exists.
    const identity = await UserIdentity.findOne({
      attributes: ['userId'],
      where: { phoneE164 },
    });
    const userId = identity?.userId ?? null;

    await OtpVerification.create({
      ...(context.ip === undefined ? {} : { ip: context.ip }),
      otpId: otp.id,
      phoneE164,
      userId,
      verifiedAt: new Date(),
    });

    return { ok: true, otpId: otp.id, userId };
  }

  /**
   * Drops a code that was never delivered. A send that failed cost nothing and
   * reached nobody, so it must not count against the cap or leave the caller
   * holding a code they never saw.
   */
  public async discard(phoneE164: string): Promise<number> {
    return Otp.destroy({ where: { consumedAt: null, phoneE164 } });
  }

  /**
   * How many codes went to this number since [since]. Every one of these costs
   * money to deliver, so the endpoint that sends them has to be capped; the
   * `otps` table already records exactly what needs counting, which beats
   * standing up a separate counter that can fail on its own.
   */
  public async recentIssueCount(
    phoneE164: string,
    since: Date,
  ): Promise<number> {
    return Otp.count({
      where: { createdAt: { [Op.gte]: since }, phoneE164 },
    });
  }

  /**
   * Expired codes are disposable. The verification history is not, which is
   * why it lives in its own table and `otp_id` is `SET NULL` rather than
   * cascading.
   */
  public async purge(olderThan: Date = new Date()): Promise<number> {
    return Otp.destroy({ where: { expiresAt: { [Op.lt]: olderThan } } });
  }
}

/** Constant time, so a wrong code cannot be narrowed by how fast it failed. */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

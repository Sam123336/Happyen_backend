import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Op } from 'sequelize';

import { RefreshToken } from '../../database/models.js';

const TOKEN_BYTES = 32;

export type RotateOutcome =
  | { ok: true; token: string; userId: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'reused' };

/**
 * Opaque, rotating refresh tokens.
 *
 * Rotation means every refresh burns the token it was given and returns a new
 * one. That turns theft into something detectable: the thief and the real
 * client cannot both use the same token, so whichever comes second presents
 * one that is already replaced. That is `reused`, and the response is to
 * revoke the entire family rather than just the token — the attacker's copy
 * and the victim's are indistinguishable at that point, so both must go.
 */
export class RefreshTokenService {
  public constructor(private readonly ttlDays = 30) {}

  /** 256 bits from the CSPRNG; url-safe so it survives a JSON body intact. */
  private mint(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  /**
   * A plain digest, deliberately. The OTP needs a keyed HMAC because six
   * digits is a million candidates; this is 2^256 and cannot be brute-forced,
   * so a hash is enough to make a leaked table useless.
   */
  public hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  public async issue(userId: string): Promise<string> {
    const token = this.mint();
    await RefreshToken.create({
      expiresAt: new Date(Date.now() + this.ttlDays * 86_400_000),
      tokenHash: this.hash(token),
      userId,
    });
    return token;
  }

  public async rotate(token: string): Promise<RotateOutcome> {
    const hash = this.hash(token);
    const existing = await RefreshToken.findOne({ where: { tokenHash: hash } });
    if (existing === null) {
      return { ok: false, reason: 'unknown' };
    }

    if (existing.revokedAt !== null) {
      // Replaced *and* presented again is theft: the token was already spent
      // for a successor, so two parties hold it and they cannot be told apart.
      if (existing.replacedById !== null) {
        await this.revokeAllForUser(existing.userId);
        return { ok: false, reason: 'reused' };
      }
      // Revoked with no successor is a sign-out. That token is simply dead,
      // and a stale client retrying must not end every other session.
      return { ok: false, reason: 'unknown' };
    }
    if (existing.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }

    const next = this.mint();
    const created = await RefreshToken.create({
      expiresAt: new Date(Date.now() + this.ttlDays * 86_400_000),
      tokenHash: this.hash(next),
      userId: existing.userId,
    });

    // Conditional on still being live, so two simultaneous refreshes cannot
    // both mint a successor from the same token.
    const [claimed] = await RefreshToken.update(
      { replacedById: created.id, revokedAt: new Date() },
      { where: { id: existing.id, revokedAt: null } },
    );
    if (claimed !== 1) {
      await created.destroy();
      await this.revokeAllForUser(existing.userId);
      return { ok: false, reason: 'reused' };
    }

    return { ok: true, token: next, userId: existing.userId };
  }

  /** Signing out: this device's token only. */
  public async revoke(token: string): Promise<void> {
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { revokedAt: null, tokenHash: this.hash(token) } },
    );
  }

  /** Every session for the account, used on reuse detection. */
  public async revokeAllForUser(userId: string): Promise<number> {
    const [revoked] = await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { revokedAt: null, userId } },
    );
    return revoked;
  }

  /** Expired and long-revoked rows are not evidence of anything. */
  public async purge(olderThan: Date = new Date()): Promise<number> {
    return RefreshToken.destroy({
      where: { expiresAt: { [Op.lt]: olderThan } },
    });
  }

  /** Exposed for tests: constant-time digest comparison. */
  public matches(token: string, hash: string): boolean {
    const a = Buffer.from(this.hash(token));
    const b = Buffer.from(hash);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

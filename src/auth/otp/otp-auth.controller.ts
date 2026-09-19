import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from '../../common/http/zod-validation.pipe.js';
import { activeDay, isoDayPattern } from '../../users/streak.js';
import { UserRepository } from '../../users/user.repository.js';
import { Fast2SmsSender } from '../sms/fast2sms.sender.js';
import { OtpService } from './otp.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { SessionTokenService } from './session-token.service.js';

/** Codes are only worth sending to a number that could receive one. */
const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Expected E.164');

const requestSchema = z.object({ phone: phoneSchema }).strict();
const verifySchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    localDate: z.string().regex(isoDayPattern).optional(),
    phone: phoneSchema,
  })
  .strict();
const refreshSchema = z.object({ refreshToken: z.string().min(1) }).strict();

/** Three codes per number per window; each one costs money to deliver. */
const MAX_SENDS = 3;
const WINDOW_MS = 15 * 60 * 1000;
const ACCESS_TTL_SECONDS = 15 * 60;

@Controller('auth/otp')
export class OtpAuthController {
  public constructor(
    private readonly otps: OtpService,
    private readonly sender: Fast2SmsSender,
    private readonly sessions: SessionTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly users: UserRepository,
  ) {}

  @Post('request')
  @HttpCode(202)
  public async request(
    @Body(new ZodValidationPipe(requestSchema))
    body: z.infer<typeof requestSchema>,
  ): Promise<{ status: 'sent' }> {
    const sent = await this.otps.recentIssueCount(
      body.phone,
      new Date(Date.now() - WINDOW_MS),
    );
    if (sent >= MAX_SENDS) {
      // Nest has no TooManyRequestsException; 429 is the right status anyway.
      throw new HttpException(
        {
          code: 'otp_rate_limited',
          message: 'Too many codes requested for this number. Try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = await this.otps.issue(body.phone);
    try {
      await this.sender.send(body.phone, code);
    } catch (error: unknown) {
      // A code that never went out must not spend one of the caller's three
      // tries, or a provider outage becomes a fifteen-minute lockout.
      await this.otps.discard(body.phone);
      throw error;
    }

    // The same answer whether or not the number has an account: this endpoint
    // must not become a way to ask who is registered.
    return { status: 'sent' };
  }

  @Post('verify')
  public async verify(
    @Body(new ZodValidationPipe(verifySchema))
    body: z.infer<typeof verifySchema>,
  ) {
    const outcome = await this.otps.verify(body.phone, body.code);
    if (!outcome.ok) {
      throw new UnauthorizedException({
        code: `otp_${outcome.reason}`,
        message: 'That code is not valid',
      });
    }

    // Keyed on the number, so the same phone always reaches the same account.
    const user = await this.users.provision(
      {
        emailVerified: false,
        issuer: 'happyen',
        phoneE164: body.phone,
        subject: body.phone,
      },
      activeDay(body.localDate),
    );

    return { ...(await this.issueSession(user.userId)), user };
  }

  @Post('refresh')
  public async refresh(
    @Body(new ZodValidationPipe(refreshSchema))
    body: z.infer<typeof refreshSchema>,
  ) {
    const rotated = await this.refreshTokens.rotate(body.refreshToken);
    if (!rotated.ok) {
      // `reused` has already revoked the family; the client learns only that
      // it must sign in again.
      throw new UnauthorizedException({
        code: `refresh_${rotated.reason}`,
        message: 'That session has ended. Sign in again.',
      });
    }

    return {
      accessToken: await this.sessions.sign(rotated.userId),
      expiresIn: ACCESS_TTL_SECONDS,
      refreshToken: rotated.token,
      tokenType: 'Bearer' as const,
    };
  }

  @Post('logout')
  @HttpCode(204)
  public async logout(
    @Body(new ZodValidationPipe(refreshSchema))
    body: z.infer<typeof refreshSchema>,
  ): Promise<void> {
    // Revoking is unconditional: a token that was never valid ends in the same
    // place, and saying which is which would be an oracle.
    await this.refreshTokens.revoke(body.refreshToken);
  }

  private async issueSession(userId: string) {
    return {
      accessToken: await this.sessions.sign(userId),
      expiresIn: ACCESS_TTL_SECONDS,
      refreshToken: await this.refreshTokens.issue(userId),
      tokenType: 'Bearer' as const,
    };
  }
}

import { ServiceUnavailableException } from '@nestjs/common';

import { parseEnvironment } from '../../config/index.js';
import { createLogger } from '../../observability/index.js';

const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';

/**
 * Fast2SMS `route: "otp"`: we supply the code, so there is no sender id, no
 * message template and no DLT registration. It is India-only, which is why a
 * number that is not Indian is refused here rather than sent and lost.
 */
export class Fast2SmsSender {
  public constructor(
    private readonly apiKey?: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly route: 'otp' | 'q' = 'otp',
  ) {}

  /**
   * `otp` hands Fast2SMS the digits and lets it compose its own message; `q`
   * takes free text, so the wording is ours. Same code either way.
   */
  private payload(numbers: string, otp: string): Record<string, unknown> {
    return this.route === 'otp'
      ? { numbers, route: 'otp', variables_values: otp }
      : {
          flash: 0,
          message: `${otp} is your Happyen sign-in code. It expires in 5 minutes.`,
          numbers,
          route: 'q',
        };
  }

  public async send(phoneE164: string, otp: string): Promise<void> {
    // Unconfigured is a 503 on this one route, not a refusal to boot: the rest
    // of the API has nothing to do with sending codes.
    if (this.apiKey === undefined) {
      throw new ServiceUnavailableException({
        code: 'sms_provider_not_configured',
        message: 'FAST2SMS_API_KEY is not configured',
      });
    }

    const response = await this.fetchImpl(FAST2SMS_URL, {
      body: JSON.stringify(this.payload(toIndianNumber(phoneE164), otp)),
      headers: {
        authorization: this.apiKey,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    // Fast2SMS answers 200 with `"return": false` on a rejected send, so the
    // status alone would report a delivered code that never left.
    const body: unknown = await response.json().catch(() => null);
    const accepted =
      response.ok &&
      typeof body === 'object' &&
      body !== null &&
      (body as { return?: unknown }).return === true;

    if (!accepted) {
      // A plain Error here became an opaque 500: the caller could not tell a
      // provider outage from a bug in this service, and the reason never
      // reached the logs. Record what the provider actually said, then fail as
      // the dependency failure it is.
      const environment = parseEnvironment(process.env);
      createLogger({
        environment: environment.HAPPYN_ENV,
        level: environment.LOG_LEVEL,
        service: 'happyn-api',
      }).error(
        { provider: body, status: response.status },
        'Fast2SMS refused to send a code',
      );

      throw new ServiceUnavailableException({
        code: 'sms_delivery_failed',
        message: 'We could not send the code. Please try again.',
      });
    }
  }
}

/**
 * Supabase sends E.164 (`+919876543210`). Fast2SMS wants the bare ten-digit
 * subscriber number.
 */
export function toIndianNumber(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  if (digits.length === 10) {
    return digits;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  throw new Error('Fast2SMS can only deliver to Indian mobile numbers');
}

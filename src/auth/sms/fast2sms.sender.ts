import { ServiceUnavailableException } from '@nestjs/common';

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
  ) {}

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
      body: JSON.stringify({
        numbers: toIndianNumber(phoneE164),
        route: 'otp',
        variables_values: otp,
      }),
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
      throw new Error(
        `Fast2SMS rejected the send with status ${response.status}`,
      );
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

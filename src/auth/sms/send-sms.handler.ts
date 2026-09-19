import type { IncomingMessage, ServerResponse } from 'node:http';

import { z } from 'zod';

import { parseEnvironment } from '../../config/index.js';
import { createLogger } from '../../observability/index.js';
import { Fast2SmsSender } from './fast2sms.sender.js';
import { isValidWebhook } from './standard-webhook.js';

/**
 * Supabase's Send SMS Hook. Supabase still generates the code, verifies it and
 * issues the session; this only delivers. Nothing here can mint a token, and
 * no OTP is ever stored.
 */
const hookPayloadSchema = z.object({
  sms: z.object({ otp: z.string().min(1) }),
  user: z.object({ phone: z.string().min(1) }),
});

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const environment = parseEnvironment(process.env);
  const logger = createLogger({
    environment: environment.HAPPYN_ENV,
    level: environment.LOG_LEVEL,
    service: 'happyn-api',
  });

  const reply = (status: number, body: unknown): void => {
    response.statusCode = status;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(body));
  };

  // No secret means no way to tell Supabase from anyone else, and this
  // endpoint spends money. Fail closed, as the cron endpoints do.
  const secret = environment.SEND_SMS_HOOK_SECRET;
  if (secret === undefined || environment.FAST2SMS_API_KEY === undefined) {
    logger.error('Send SMS hook is not configured');
    return reply(500, { error: { message: 'Hook is not configured' } });
  }

  // The signature covers the exact bytes received; a parsed and re-serialised
  // body would not match.
  const raw = await readBody(request);
  const verified = isValidWebhook(
    raw,
    {
      id: header(request, 'webhook-id'),
      signature: header(request, 'webhook-signature'),
      timestamp: header(request, 'webhook-timestamp'),
    },
    secret,
  );
  if (!verified) {
    logger.warn('Rejected a Send SMS hook call with an invalid signature');
    return reply(401, { error: { message: 'Invalid signature' } });
  }

  const parsed = hookPayloadSchema.safeParse(safeJsonParse(raw));
  if (!parsed.success) {
    return reply(400, { error: { message: 'Unreadable hook payload' } });
  }

  try {
    await new Fast2SmsSender(environment.FAST2SMS_API_KEY).send(
      parsed.data.user.phone,
      parsed.data.sms.otp,
    );
    // Never log the code itself; the phone number is enough to trace a send.
    logger.info({ phone: parsed.data.user.phone }, 'Delivered a sign-in code');
    reply(200, {});
  } catch (error) {
    // A 500 tells Supabase the code did not go out, so the caller sees a
    // failure instead of waiting for a message that never arrives.
    logger.error({ err: error }, 'Could not deliver the sign-in code');
    reply(500, { error: { message: 'Could not deliver the sign-in code' } });
  }
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

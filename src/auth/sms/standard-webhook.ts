import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Standard Webhooks verification, which is the scheme Supabase Auth hooks use.
 *
 * The signed content is `{id}.{timestamp}.{body}` over the *raw* body: a
 * re-serialised object is a different byte string and will not match. The
 * secret arrives as `v1,whsec_<base64>`; only the base64 after the prefix is
 * the key.
 *
 * Hand-rolled rather than pulling in a package, the same way `cron/authorize`
 * checks its bearer token — but the tests alongside this file are the point,
 * because a webhook verifier that silently accepts everything looks exactly
 * like one that works.
 */
const TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
}

export function isValidWebhook(
  body: string,
  headers: WebhookHeaders,
  secret: string,
  now: Date = new Date(),
): boolean {
  const { id, signature, timestamp } = headers;
  if (id === undefined || signature === undefined || timestamp === undefined) {
    return false;
  }

  // A captured request must not stay replayable forever.
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    return false;
  }
  const driftSeconds = Math.abs(Math.floor(now.getTime() / 1000) - sentAt);
  if (driftSeconds > TOLERANCE_SECONDS) {
    return false;
  }

  const key = secret.replace(/^v1,/, '').replace(/^whsec_/, '');
  const expected = createHmac('sha256', Buffer.from(key, 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');

  // The header may carry several space-separated versioned signatures; during
  // a secret rotation exactly one of them is the current key.
  return signature
    .split(' ')
    .some((candidate) => matches(candidate.replace(/^v1,/, ''), expected));
}

function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { isValidWebhook } from './standard-webhook.js';

const key = Buffer.from('a-shared-secret-for-tests').toString('base64');
const secret = `v1,whsec_${key}`;
const body = JSON.stringify({
  sms: { otp: '123456' },
  user: { phone: '+919876543210' },
});
const id = 'msg_2abc';
const now = new Date('2026-09-20T10:00:00Z');
const timestamp = String(Math.floor(now.getTime() / 1000));

function sign(content: string): string {
  return createHmac('sha256', Buffer.from(key, 'base64'))
    .update(content)
    .digest('base64');
}

const valid = `v1,${sign(`${id}.${timestamp}.${body}`)}`;

describe('isValidWebhook', () => {
  it('accepts a correctly signed request', () => {
    expect(
      isValidWebhook(body, { id, signature: valid, timestamp }, secret, now),
    ).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    const forged = `v1,${createHmac('sha256', Buffer.from('other'))
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64')}`;

    expect(
      isValidWebhook(body, { id, signature: forged, timestamp }, secret, now),
    ).toBe(false);
  });

  it('rejects a body that was altered after signing', () => {
    const tampered = body.replace('123456', '000000');

    expect(
      isValidWebhook(
        tampered,
        { id, signature: valid, timestamp },
        secret,
        now,
      ),
    ).toBe(false);
  });

  it('rejects a replay from outside the tolerance window', () => {
    const muchLater = new Date(now.getTime() + 10 * 60 * 1000);

    expect(
      isValidWebhook(
        body,
        { id, signature: valid, timestamp },
        secret,
        muchLater,
      ),
    ).toBe(false);
  });

  it('accepts during a rotation, when one of several signatures matches', () => {
    const both = `v1,${sign('something-else')} ${valid}`;

    expect(
      isValidWebhook(body, { id, signature: both, timestamp }, secret, now),
    ).toBe(true);
  });

  it.each(['id', 'signature', 'timestamp'] as const)(
    'rejects a request with no %s header',
    (missing) => {
      const headers = { id, signature: valid, timestamp };
      headers[missing] = undefined as never;

      expect(isValidWebhook(body, headers, secret, now)).toBe(false);
    },
  );

  it('rejects a non-numeric timestamp rather than treating it as now', () => {
    expect(
      isValidWebhook(
        body,
        { id, signature: valid, timestamp: 'soon' },
        secret,
        now,
      ),
    ).toBe(false);
  });
});

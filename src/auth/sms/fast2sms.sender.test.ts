import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import { Fast2SmsSender, toIndianNumber } from './fast2sms.sender.js';

function stubFetch(body: unknown, ok = true, status = 200) {
  const calls: { body: unknown; headers: unknown; url: string }[] = [];
  const fetchImpl = (url: string | URL, init?: RequestInit) => {
    calls.push({
      body: JSON.parse(init?.body as string),
      headers: init?.headers,
      url: String(url),
    });
    return Promise.resolve({
      json: () => Promise.resolve(body),
      ok,
      status,
    });
  };
  return { calls, fetchImpl };
}

describe('Fast2SmsSender', () => {
  beforeEach(() => {
    // The failure path logs, and the logger reads the parsed environment.
    process.env = { DATABASE_URL: 'postgresql://localhost/happyn' };
  });

  it('posts the code on the otp route, which needs no sender id or template', async () => {
    const { calls, fetchImpl } = stubFetch({ return: true });

    await new Fast2SmsSender('secret-key', fetchImpl as never).send(
      '+919876543210',
      '123456',
    );

    expect(calls[0]?.url).toBe('https://www.fast2sms.com/dev/bulkV2');
    expect(calls[0]?.body).toEqual({
      numbers: '9876543210',
      route: 'otp',
      variables_values: '123456',
    });
    expect(calls[0]?.headers).toMatchObject({ authorization: 'secret-key' });
  });

  it('treats a 200 carrying "return": false as a failed send', async () => {
    const { fetchImpl } = stubFetch({
      message: ['Invalid Authorization'],
      return: false,
    });

    // A provider refusal is a dependency failure, not a bug in this service:
    // a plain Error here would surface to the caller as an opaque 500.
    await expect(
      new Fast2SmsSender('expired-key', fetchImpl as never).send(
        '9876543210',
        '123456',
      ),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('reports an HTTP failure the same way', async () => {
    const { fetchImpl } = stubFetch({}, false, 401);

    await expect(
      new Fast2SmsSender('bad-key', fetchImpl as never).send(
        '9876543210',
        '123456',
      ),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('toIndianNumber', () => {
  it.each([
    ['+919876543210', '9876543210'],
    ['919876543210', '9876543210'],
    ['9876543210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
  ])('normalises %s', (input, expected) => {
    expect(toIndianNumber(input)).toBe(expected);
  });

  it('refuses a number Fast2SMS cannot deliver to', () => {
    // Fast2SMS is India-only: failing here beats a send that silently vanishes.
    expect(() => toIndianNumber('+14155552671')).toThrow(
      'Indian mobile numbers',
    );
  });
});

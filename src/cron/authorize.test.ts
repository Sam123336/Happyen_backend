import type { IncomingMessage } from 'node:http';

import { describe, expect, it } from 'vitest';

import { isAuthorizedCronRequest } from './authorize.js';

function request(authorization?: string): IncomingMessage {
  return {
    headers: authorization === undefined ? {} : { authorization },
  } as IncomingMessage;
}

const base = { DATABASE_URL: 'postgresql://localhost/happyn' };

describe('isAuthorizedCronRequest', () => {
  it('accepts the bearer token Vercel Cron sends', () => {
    process.env = {
      ...base,
      CRON_SECRET: 'topsecret',
      HAPPYN_ENV: 'production',
    };
    expect(isAuthorizedCronRequest(request('Bearer topsecret'))).toBe(true);
  });

  it('rejects a wrong token', () => {
    process.env = {
      ...base,
      CRON_SECRET: 'topsecret',
      HAPPYN_ENV: 'production',
    };
    expect(isAuthorizedCronRequest(request('Bearer guess'))).toBe(false);
  });

  it('rejects a missing header', () => {
    process.env = {
      ...base,
      CRON_SECRET: 'topsecret',
      HAPPYN_ENV: 'production',
    };
    expect(isAuthorizedCronRequest(request())).toBe(false);
  });

  it('refuses to run unauthenticated outside local when no secret is set', () => {
    process.env = { ...base, HAPPYN_ENV: 'production' };
    expect(isAuthorizedCronRequest(request('Bearer anything'))).toBe(false);
  });

  it('allows local development without a secret', () => {
    process.env = { ...base, HAPPYN_ENV: 'local' };
    expect(isAuthorizedCronRequest(request())).toBe(true);
  });
});

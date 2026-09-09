import { describe, expect, it } from 'vitest';

import { parseEnvironment } from './index.js';

describe('parseEnvironment', () => {
  it('parses valid local configuration and defaults', () => {
    expect(
      parseEnvironment({
        DATABASE_URL: 'postgresql://happyn:happyn@localhost:55432/happyn',
      }),
    ).toEqual({
      DATABASE_URL: 'postgresql://happyn:happyn@localhost:55432/happyn',
      HAPPYN_ENV: 'local',
      LOG_LEVEL: 'info',
      PORT: 3000,
    });
  });

  it('rejects an invalid port', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: 'postgresql://localhost/happyn',
        PORT: '70000',
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('accepts DB_URL as a database URL alias', () => {
    expect(
      parseEnvironment({
        DB_URL: 'postgresql://localhost/happyn',
      }).DATABASE_URL,
    ).toBe('postgresql://localhost/happyn');
  });

  it('treats a blank optional variable as unset', () => {
    // A `.env` template line or an empty Vercel variable must not fail the
    // boot: SUPABASE_URL= is not a malformed URL, it is an absent one.
    expect(
      parseEnvironment({
        DATABASE_URL: 'postgresql://localhost/happyn',
        SUPABASE_URL: '',
      }),
    ).not.toHaveProperty('SUPABASE_URL');

    expect(
      parseEnvironment({
        DATABASE_URL: 'postgresql://localhost/happyn',
        SUPABASE_URL: 'https://abc.supabase.co',
      }).SUPABASE_URL,
    ).toBe('https://abc.supabase.co');
  });

  it('still rejects a malformed Supabase URL', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: 'postgresql://localhost/happyn',
        SUPABASE_URL: 'not-a-url',
      }),
    ).toThrow('Invalid environment configuration');
  });
});

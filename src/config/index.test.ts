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
});

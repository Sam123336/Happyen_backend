import { describe, expect, it } from 'vitest';

import { HealthService } from './health.service.js';

const database = {
  ping: () => Promise.resolve(),
};

describe('HealthService', () => {
  it('reports the API process as live', () => {
    expect(new HealthService(database as never).liveness()).toEqual({
      service: 'happyn-api',
      status: 'ok',
    });
  });

  it('reports readiness after the database responds', async () => {
    await expect(
      new HealthService(database as never).readiness(),
    ).resolves.toEqual({
      dependencies: { database: 'up' },
      service: 'happyn-api',
      status: 'ok',
    });
  });
});

import type { OnApplicationShutdown } from '@nestjs/common';
import { Sequelize } from 'sequelize';

import { initModels } from './models.js';

/**
 * One connection pool for one URL. `sslmode` in the URL decides TLS, the way
 * `psql` reads it: Sequelize forwards other query parameters to the driver but
 * has no idea what that one means.
 */
export function createSequelize(
  url: string,
  options: { poolMax: number },
): Sequelize {
  const sslmode = new URL(url).searchParams.get('sslmode');
  const ssl =
    sslmode === null || sslmode === 'disable'
      ? {}
      : { ssl: { rejectUnauthorized: sslmode === 'verify-full' } };

  return new Sequelize(url, {
    dialect: 'postgres',
    dialectOptions: ssl,
    logging: false,
    pool: { max: options.poolMax, min: 0 },
  });
}

/** Owns the connection for the process; every repository goes through it. */
export class DatabaseService implements OnApplicationShutdown {
  public constructor(public readonly sequelize: Sequelize) {
    initModels(sequelize);
  }

  public async ping(): Promise<void> {
    await this.sequelize.authenticate();
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.sequelize.close();
  }
}

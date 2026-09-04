import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { DATABASE, DATABASE_POOL } from './database.constants.js';
import type * as schema from './schema/index.js';

export type HappynDatabase = NodePgDatabase<typeof schema>;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  public constructor(
    @Inject(DATABASE) public readonly client: HappynDatabase,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  public async ping(): Promise<void> {
    await this.client.execute(sql`select 1`);
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

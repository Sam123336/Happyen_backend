import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { isServerless, parseEnvironment } from '../config/index.js';
import { DATABASE, DATABASE_POOL } from './database.constants.js';
import { DatabaseService, type HappynDatabase } from './database.service.js';
import * as schema from './schema/index.js';

/**
 * Every serverless invocation gets its own container, so a large pool per
 * container multiplies into far more connections than Supabase allows. One
 * connection per container, fronted by the Supavisor transaction pooler, is
 * the supported shape.
 */
function poolSize(): number {
  return isServerless() ? 1 : 10;
}

@Global()
@Module({
  exports: [DatabaseService],
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (): Pool => {
        const environment = parseEnvironment(process.env);
        return new Pool({
          connectionString: environment.DATABASE_URL,
          max: poolSize(),
        });
      },
    },
    {
      inject: [DATABASE_POOL],
      provide: DATABASE,
      useFactory: (pool: Pool): HappynDatabase => drizzle(pool, { schema }),
    },
    DatabaseService,
  ],
})
export class DatabaseModule {}

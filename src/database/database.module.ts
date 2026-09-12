import { Global, Module } from '@nestjs/common';

import { isServerless, parseEnvironment } from '../config/index.js';
import { createSequelize, DatabaseService } from './database.service.js';

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
      provide: DatabaseService,
      useFactory: (): DatabaseService =>
        new DatabaseService(
          createSequelize(parseEnvironment(process.env).DATABASE_URL, {
            poolMax: poolSize(),
          }),
        ),
    },
  ],
})
export class DatabaseModule {}

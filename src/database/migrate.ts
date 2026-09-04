import { config as loadEnvironment } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { parseEnvironment } from '../config/index.js';

loadEnvironment({ path: new URL('../../.env', import.meta.url) });

const environment = parseEnvironment(process.env);

// Migrations create types and take locks, which the transaction pooler cannot
// carry across statements, so they always run over the direct connection.
const pool = new Pool({
  connectionString: environment.DIRECT_URL ?? environment.DATABASE_URL,
});

try {
  await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  console.log('Database migrations applied');
} finally {
  await pool.end();
}

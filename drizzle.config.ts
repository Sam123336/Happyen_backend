import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      process.env.DB_URL ??
      'postgresql://happyn:happyn@localhost:55432/happyn',
  },
  dialect: 'postgresql',
  migrations: {
    prefix: 'timestamp',
  },
  out: './drizzle',
  schema: './src/database/schema/index.ts',
  strict: true,
  verbose: true,
});

import { pathToFileURL } from 'node:url';

import { config as loadEnvironment } from 'dotenv';
import type { QueryInterface } from 'sequelize';
import { SequelizeStorage, Umzug, type MigrationFn } from 'umzug';

import { parseEnvironment } from '../config/index.js';
import { createSequelize } from './database.service.js';

/**
 * Applies `src/database/migrations/*.ts` in name order and records each one
 * in `SequelizeMeta`. `--down` reverts the most recent instead.
 *
 * Migrations create types and take locks, which the transaction pooler cannot
 * carry across statements, so they always run over the direct connection.
 */
loadEnvironment({ path: new URL('../../.env', import.meta.url) });

const environment = parseEnvironment(process.env);
const sequelize = createSequelize(
  environment.DIRECT_URL ?? environment.DATABASE_URL,
  { poolMax: 1 },
);
const context = sequelize.getQueryInterface();
const storage = new SequelizeStorage({ sequelize });

interface Migration {
  down: MigrationFn<QueryInterface>;
  up: MigrationFn<QueryInterface>;
}

const umzug = new Umzug({
  context,
  logger: console,
  migrations: {
    glob: ['migrations/*.ts', { cwd: new URL('.', import.meta.url).pathname }],
    // `import`, not `require`: the migrations are ES modules like the rest.
    resolve: ({ name, path }) => {
      if (path === undefined) {
        throw new Error(`Migration ${name} has no path`);
      }
      const load = () => import(pathToFileURL(path).href) as Promise<Migration>;
      return {
        down: async (params) => (await load()).down(params),
        name,
        up: async (params) => (await load()).up(params),
      };
    },
  },
  storage,
});

/**
 * The first two migrations are ports of the Drizzle-era ones. A database that
 * Drizzle already migrated holds everything they create, so mark them applied
 * there rather than fail on "type already exists".
 */
async function adoptDrizzleHistory(): Promise<void> {
  const [rows] = await sequelize.query(
    "SELECT to_regclass('drizzle.__drizzle_migrations') AS legacy",
  );
  const legacy = (rows[0] as { legacy: string | null } | undefined)?.legacy;
  if (legacy === undefined || legacy === null) {
    return;
  }

  const applied = new Set((await umzug.executed()).map((m) => m.name));
  for (const name of [
    '20260904191355-identity.ts',
    '20260907212523-events.ts',
  ]) {
    if (!applied.has(name)) {
      await storage.logMigration({ name });
      console.log(`Adopted ${name} from the Drizzle migration history`);
    }
  }
}

try {
  if (process.argv.includes('--down')) {
    const reverted = await umzug.down();
    console.log(
      `Reverted ${reverted.map((m) => m.name).join(', ') || 'nothing'}`,
    );
  } else {
    await adoptDrizzleHistory();
    const applied = await umzug.up();
    console.log(
      applied.length === 0
        ? 'Database migrations already applied'
        : `Applied ${applied.map((m) => m.name).join(', ')}`,
    );
  }
} finally {
  await sequelize.close();
}

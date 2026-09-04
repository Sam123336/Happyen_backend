import type { IncomingMessage, ServerResponse } from 'node:http';

import { Pool } from 'pg';

import { parseEnvironment } from '../config/index.js';
import { runHeartbeat } from '../jobs/heartbeat.job.js';
import { isAuthorizedCronRequest } from './authorize.js';

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!isAuthorizedCronRequest(request)) {
    response.statusCode = 401;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ message: 'Unauthorized' }));
    return;
  }

  const environment = parseEnvironment(process.env);
  const pool = new Pool({ connectionString: environment.DATABASE_URL, max: 1 });

  try {
    const result = await runHeartbeat(async () => {
      await pool.query('select 1');
    });
    response.statusCode = result.ok ? 200 : 500;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

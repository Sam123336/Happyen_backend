import type { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

import { parseEnvironment } from '../config/index.js';

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without this check
 * the schedule endpoints are callable by anyone who learns the URL, so a
 * missing secret is treated as a failure outside local development.
 */
export function isAuthorizedCronRequest(request: IncomingMessage): boolean {
  const environment = parseEnvironment(process.env);

  if (environment.CRON_SECRET === undefined) {
    return environment.HAPPYN_ENV === 'local';
  }

  const header = request.headers.authorization;
  if (header === undefined) return false;

  const expected = Buffer.from(`Bearer ${environment.CRON_SECRET}`);
  const received = Buffer.from(header);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

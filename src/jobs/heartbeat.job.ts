import { createLogger } from '../observability/index.js';
import { parseEnvironment } from '../config/index.js';

export interface JobResult {
  durationMs: number;
  job: string;
  ok: boolean;
}

/**
 * Replaces the former standalone worker process. Vercel has no long-lived
 * processes, so scheduled work runs as a cron-triggered function instead.
 */
export async function runHeartbeat(
  check: () => Promise<void>,
): Promise<JobResult> {
  const environment = parseEnvironment(process.env);
  const logger = createLogger({
    environment: environment.HAPPYN_ENV,
    level: environment.LOG_LEVEL,
    service: 'happyn-jobs',
  });
  const startedAt = Date.now();

  try {
    await check();
    const durationMs = Date.now() - startedAt;
    logger.info({ durationMs }, 'Heartbeat job completed');
    return { durationMs, job: 'heartbeat', ok: true };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error({ durationMs, err: error }, 'Heartbeat job failed');
    return { durationMs, job: 'heartbeat', ok: false };
  }
}

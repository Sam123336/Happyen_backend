import type { IncomingMessage, ServerResponse } from 'node:http';

import { UpstashCache } from '../common/cache/upstash-cache.js';
import { parseEnvironment } from '../config/index.js';
import {
  createSequelize,
  DatabaseService,
} from '../database/database.service.js';
import {
  ingestFeedEvents,
  pruneStaleOccurrences,
} from '../events/predicthq-ingest.job.js';
import { PredictHqClient } from '../events/predicthq.client.js';
import { isAuthorizedCronRequest } from './authorize.js';

/** The city the feed is ingested around. */
const BENGALURU = { latitude: 12.9716, longitude: 77.5946 };

/**
 * Pulls the events feed into Happyen's own tables once a day.
 *
 * This is what keeps the provider's API call count near one per run: every
 * request to `/v1/events/nearby` reads Postgres, never PredictHQ.
 */
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
  const database = new DatabaseService(
    createSequelize(environment.DIRECT_URL ?? environment.DATABASE_URL, {
      poolMax: 1,
    }),
  );
  const cache =
    environment.UPSTASH_REDIS_REST_URL === undefined ||
    environment.UPSTASH_REDIS_REST_TOKEN === undefined
      ? undefined
      : new UpstashCache(
          environment.UPSTASH_REDIS_REST_URL,
          environment.UPSTASH_REDIS_REST_TOKEN,
          6 * 60 * 60,
        );

  try {
    const feed = await new PredictHqClient(
      environment.PREDICTHQ_TOKEN,
      globalThis.fetch,
      cache,
    ).upcoming({
      ...BENGALURU,
      limit: 200,
      radiusKm: environment.PREDICTHQ_RADIUS_KM,
    });

    const result = await ingestFeedEvents(feed);
    // A week of grace, so "what was on last night" still answers.
    const pruned = await pruneStaleOccurrences(
      new Date(Date.now() - 7 * 86_400_000),
    );

    response.statusCode = 200;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ...result, fetched: feed.length, pruned }));
  } catch (error: unknown) {
    response.statusCode = 500;
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        message: error instanceof Error ? error.message : 'Ingest failed',
      }),
    );
  } finally {
    await database.sequelize.close();
  }
}

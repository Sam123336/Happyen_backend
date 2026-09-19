import { parseEnvironment } from '../config/index.js';
import {
  createSequelize,
  DatabaseService,
} from '../database/database.service.js';
import { Venue } from '../database/models.js';
import { queue } from './queue.client.js';
import { runVenueIngest } from './venue-ingest.job.js';

/**
 * The queue consumer. `handleNodeCallback` is the `(req, res)` form, which is
 * what this project's function shims deal in; the Web `Request`/`Response`
 * `handleCallback` is for framework route files.
 *
 * The trigger in `vercel.json` makes this function private: it has no public
 * URL and only Vercel's queue infrastructure can invoke it, so unlike the cron
 * endpoints there is no shared secret to check.
 */
export default queue.handleNodeCallback(
  async (message) => {
    const environment = parseEnvironment(process.env);
    // A queue consumer is its own invocation, outside the Nest container, so
    // it opens and closes one connection the way the cron function does.
    const database = new DatabaseService(
      createSequelize(environment.DATABASE_URL, { poolMax: 1 }),
    );

    try {
      await runVenueIngest(message, async (venue) => {
        await Venue.upsert(venue, {
          // Sequelize types `conflictFields` as attribute names but emits them
          // verbatim as column identifiers, without the `underscored` mapping.
          // The column name is what actually works; the cast is the type bug,
          // not the value. Verified against the generated ON CONFLICT clause.
          conflictFields: ['foursquare_place_id' as keyof typeof venue],
        });
      });
    } finally {
      await database.sequelize.close();
    }
  },
  {
    // A message that keeps failing is a poison message by the sixth delivery;
    // acknowledge it rather than burn invocations until the TTL expires.
    retry: (_error, metadata) =>
      metadata.deliveryCount > 5 ? { acknowledge: true } : undefined,
  },
);

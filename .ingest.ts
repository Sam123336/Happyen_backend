import { Sequelize } from 'sequelize';
import { initModels, Event, EventOccurrence, Venue } from './src/database/models.js';
import { PredictHqClient } from './src/events/predicthq.client.js';
import { ingestFeedEvents } from './src/events/predicthq-ingest.job.js';

const sq = new Sequelize(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, {
  dialect: 'postgres', dialectOptions: { ssl: { rejectUnauthorized: false } },
  logging: false, pool: { max: 2, min: 0 },
});
initModels(sq);

const feed = await new PredictHqClient(process.env.PREDICTHQ_TOKEN).upcoming({
  latitude: 12.9716, longitude: 77.5946, limit: 200, radiusKm: 25,
});
console.log('feed events (mapped categories only):', feed.length);
console.log('run 1:', JSON.stringify(await ingestFeedEvents(feed)));
console.log('run 2:', JSON.stringify(await ingestFeedEvents(feed)), '<- occurrences 0 = idempotent');
console.log('\nevents:', await Event.count({ where: { source: 'predicthq' } }),
            '| occurrences:', await EventOccurrence.count(),
            '| venues:', await Venue.count());
console.log('\nsample pins:');
for (const o of await EventOccurrence.findAll({ include: [{ model: Event, as: 'event' }], order: [['startAt','ASC']], limit: 8 })) {
  const e = (o as any).event;
  console.log(`  [${String(e?.category).padEnd(6)}] ${String(e?.title).slice(0,42).padEnd(42)} ${o.startAt.toISOString().slice(0,10)}  ${o.venueName.slice(0,28)}`);
}
await sq.close();

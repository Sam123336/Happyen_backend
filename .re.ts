import { Sequelize } from 'sequelize';
import { initModels, Event, EventOccurrence, Venue } from './src/database/models.js';
import { PredictHqClient } from './src/events/predicthq.client.js';
import { ingestFeedEvents } from './src/events/predicthq-ingest.job.js';
const sq = new Sequelize(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, {
  dialect: 'postgres', dialectOptions: { ssl: { rejectUnauthorized: false } }, logging: false, pool: { max: 2, min: 0 },
});
initModels(sq);
// Clear the badly-named venues from the first pass.
await EventOccurrence.destroy({ where: {} });
await Event.destroy({ where: { source: 'predicthq' } });
await Venue.destroy({ where: {} });
const feed = await new PredictHqClient(process.env.PREDICTHQ_TOKEN).upcoming({
  latitude: 12.9716, longitude: 77.5946, limit: 200, radiusKm: 25,
});
console.log('ingest:', JSON.stringify(await ingestFeedEvents(feed)));
console.log('re-run:', JSON.stringify(await ingestFeedEvents(feed)));
console.log('\npins now:');
for (const o of await EventOccurrence.findAll({ include: [{ model: Event, as: 'event' }], order: [['startAt','ASC']], limit: 8 })) {
  const e = (o as any).event;
  console.log(`  [${String(e?.category).padEnd(6)}] ${String(e?.title).slice(0,34).padEnd(34)} @ ${o.venueName.slice(0,38)}`);
}
await sq.close();

import pg from 'pg';
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (l, sql) => {
  const { rows } = await c.query(sql);
  console.log(`  ${l.padEnd(22)}: ${rows.map(r => Object.values(r).join('/')).join(', ') || '(none)'}`);
};
console.log(`  host                  : ${new URL(url).hostname}`);
await q('extensions', "select extname from pg_extension where extname in ('postgis','pg_trgm','unaccent') order by 1");
await q('tables', "select table_name from information_schema.tables where table_schema='public' and table_name not in ('geography_columns','geometry_columns','spatial_ref_sys') order by 1");
await q('geography cols', "select f_table_name||'.'||f_geography_column from geography_columns order by 1");
await q('gist indexes', "select indexname from pg_indexes where schemaname='public' and indexdef ilike '%gist%' order by 1");
await q('phone index', "select indexname from pg_indexes where tablename='user_identities' and indexname like '%phone%'");
await q('refresh uniq', "select indexname from pg_indexes where tablename='refresh_tokens' and indexdef ilike '%unique%'");
await q('otp_verifications fk', "select confdeltype from pg_constraint where conname like '%otp_verifications_otp_id%'");
await q('applied', 'select count(*)::text from "SequelizeMeta"');
await c.end();

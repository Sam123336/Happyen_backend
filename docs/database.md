# Database

PostgreSQL with PostGIS is the approved source of truth. The initial identity migration enables `postgis`, `pg_trgm`, and `unaccent`, then creates `users`, `user_identities`, `profiles`, and `privacy_settings`.

Firebase subject IDs belong in `user_identities`; domain tables reference the internal UUID in `users`. This prevents an identity vendor identifier from becoming the product's primary key and leaves room for controlled account linking later. Provider contact data is refreshed on successful session creation, while user-edited profile fields remain authoritative.

Privacy defaults are deliberately conservative for sensitive data: presence is visible to nobody, moments to friends, and the basic profile to everyone. Every domain row owned by a user cascades from the internal user record.

All schema changes use ordered, committed migrations. `pnpm db:generate` creates a candidate migration and `pnpm db:migrate` applies reviewed SQL; schema push is not used against shared environments. Spatial columns use SRID 4326, with `geography(Point,4326)` for meter-based proximity and indexed geometry for venue/city boundaries. Exact indexes and retention constraints are introduced with their owning domain.

`DATABASE_URL` is the canonical environment name. `DB_URL` is also accepted for hosted providers that supply that name. An app-specific `apps/api/.env` is loaded before the repository-root `.env`, while already-exported process variables retain highest precedence.

## Geography columns

`geography(Point,4326)` has no Drizzle column type, so `events.schema.ts`
declares it with `customType`. `drizzle-kit generate` renders unknown types as
quoted identifiers — `"geography(Point,4326)"` — which Postgres rejects, so the
generated SQL needs the quotes removed around that type before it is applied.
This is exactly the review step the workflow above already assumes.

Nothing selects a geography column directly, because the driver returns WKB.
Queries project `ST_X`/`ST_Y` off a geometry cast, and writes go through
`ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.

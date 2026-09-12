# Database

PostgreSQL with PostGIS is the approved source of truth. The identity migration enables `postgis`, `pg_trgm`, and `unaccent`, then creates `users`, `user_identities`, `profiles`, and `privacy_settings`; the events migration adds `venues`, `events` and `event_occurrences`.

Provider subject IDs belong in `user_identities`; domain tables reference the internal UUID in `users`. This prevents an identity vendor identifier from becoming the product's primary key and leaves room for controlled account linking later. Provider contact data is refreshed on successful session creation, while user-edited profile fields remain authoritative.

`profiles.streak_days` and `profiles.streak_last_active_on` carry the city streak: consecutive phone-local calendar days on which the account created a session. The rule lives in `src/users/streak.ts`; the repository reads, advances and writes it on every `POST /auth/session`.

Privacy defaults are deliberately conservative for sensitive data: presence is visible to nobody, moments to friends, and the basic profile to everyone. Every domain row owned by a user cascades from the internal user record.

## Access and migrations

Sequelize models in `src/database/models.ts` describe the tables for queries only; the schema is owned by the migrations in `src/database/migrations/`, and `sync()` is never used. Each migration exports `up` and `down` written with `queryInterface`, and Umzug applies them in name order, recording each in `SequelizeMeta`. `pnpm db:migrate` applies pending migrations over the direct connection; `pnpm db:migrate:down` reverts the latest. Schema push is not used against shared environments.

A database that was migrated under Drizzle is adopted, not rebuilt: `migrate.ts` sees `drizzle.__drizzle_migrations` and marks the two ported migrations as applied before running anything newer.

`DATABASE_URL` is the canonical environment name. `DB_URL` is also accepted for hosted providers that supply that name. `sslmode` in the URL decides TLS, as it does for `psql`.

## Geography columns

`geography(Point,4326)` is Sequelize's `DataTypes.GEOGRAPHY('POINT', 4326)`. Values cross the boundary as GeoJSON points, longitude first: Sequelize writes them with `ST_GeomFromGeoJSON` and parses the column back into GeoJSON on read, so the map's coordinates are read straight off the row. Proximity stays in PostGIS through `fn('ST_DWithin', ...)` and `fn('ST_Distance', ...)`, which is the form that uses the GiST indexes.

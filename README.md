# Happyen backend

The Happyen API and its scheduled jobs. Split out of the `Happyen` monorepo so it
can deploy independently to Vercel against Neon Postgres. The Flutter client
lives in the other repository and only knows this service by its HTTPS origin.

- NestJS modular monolith on Express, served by a Vercel Function.
- Sequelize over Postgres, with PostGIS for the geospatial work; migrations are
  written against Sequelize's `queryInterface` and run by Umzug.
- Scheduled work runs as Vercel Cron Functions rather than a worker process.

The full product and architecture plan is in
[docs/architecture-proposal.md](docs/architecture-proposal.md). Its hosting,
queue and repository sections were superseded by this deployment; the status
header at the top of that file says how.

## Local setup

1. Copy `.env.example` to `.env` and keep it uncommitted.
2. `pnpm install`
3. `pnpm infra:up` to start Postgres with PostGIS.
4. `pnpm db:migrate`
5. `pnpm db:seed` for demonstration events, so the map has pins before any real
   inventory exists. The venues are invented names at real Bengaluru
   coordinates; one local-only fixture is deliberately ongoing to exercise the
   mobile live-map treatment. It refuses to run when `HAPPYN_ENV` is
   `production`.
6. `pnpm dev`
7. Check `http://localhost:3000/v1/health/ready`.

## Quality commands

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Neon

Neon exposes two endpoints and this service needs both. Unlike Supabase, they
share port 5432 and differ only by `-pooler` in the hostname.

| Variable       | Host                  | Used by                     |
| -------------- | --------------------- | --------------------------- |
| `DATABASE_URL` | `<endpoint>-pooler.…` | Serverless request handling |
| `DIRECT_URL`   | `<endpoint>.…`        | Migrations only             |

The `-pooler` host is PgBouncer in transaction mode. Serverless containers must
go through it, because each container holds its own connection and would
otherwise exhaust the project's connection limit. The pool size drops to one
connection per container automatically when `VERCEL` is set.

Migrations take locks and create types, which a transaction pooler cannot carry
across statements, so they always use the direct endpoint.

Neon scales compute to zero when idle, so the first request after a quiet spell
pays a cold start of a few seconds. Integration tests budget for it; see the
timeout on the `*.integration.test.ts` suites.

## Environments

Three environments, one Neon project each, selected by env file. Node's own
`--env-file` loads the chosen one; `dotenv` does not override what is already
set, so no source change was needed.

| File        | `HAPPYN_ENV` | Neon project       | Region    |
| ----------- | ------------ | ------------------ | --------- |
| `.env`      | `local`      | `ep-bitter-cloud`  | us-east-2 |
| `.env.uat`  | `staging`    | `ep-divine-band`   | us-east-2 |
| `.env.prod` | `production` | `ep-delicate-surf` | us-east-1 |

```text
pnpm db:migrate         pnpm start
pnpm db:migrate:uat     pnpm start:uat
pnpm db:migrate:prod    pnpm start:prod
```

Each file needs a matched pair: `DATABASE_URL` on the `-pooler` host and
`DIRECT_URL` on the same host without it. Mixing projects across the two is the
failure that looks like success — migrations report applied while the database
the API reads stays empty.

All three are gitignored (`.env*`, minus `.env.example`). They hold live
credentials; only `.env.example` is committed.

## Migrations

Schema changes are TypeScript files under `src/database/migrations/`, named
`<timestamp>-<what>.ts`, each exporting `up` and `down` written with
Sequelize's `queryInterface` (`createTable`, `addColumn`, `addIndex`,
`addConstraint`). Umzug applies them in name order and records each in the
`SequelizeMeta` table; `pnpm db:migrate` applies what is pending and
`pnpm db:migrate:down` reverts the most recent one. The only raw SQL is
`CREATE EXTENSION`, which Sequelize has no method for.

The first two migrations are ports of the Drizzle-era ones. A database that
Drizzle migrated already holds their tables, so `db:migrate` recognises the
`drizzle.__drizzle_migrations` table and records those two as applied instead
of re-running them; only newer migrations are executed there. Enum types on
such a database keep their Drizzle-era names (`user_status`), while a fresh
database gets Sequelize's (`enum_users_status`); no query depends on either.

Enable the extensions once per Neon project, matching
`infrastructure/docker/postgres/init/001-extensions.sql`:

```sql
create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
```

## Places cache

`GET /v1/places/search` is a paid call upstream, so a result is cached in
Upstash Redis and a repeated search inside the window costs nothing. Upstash is
reached over its REST API rather than a Redis client: a TCP connection per
serverless invocation is the same problem the Neon pooler solves for Postgres,
and the protocol here is one POST whose body is the command as a JSON array.

Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (the Vercel
integration injects both). Without them the cache is off and every search goes
upstream, exactly as before.

A cache miss and a cache outage are the same answer, so Redis being down never
fails a search — it just stops saving calls.

Coordinates are rounded to three decimals, about a 110m grid, because a phone's
fix jitters between calls and an exact-coordinate key would never hit. The
trade-off is that `distanceMeters` can be stale by up to that much; see the
`ponytail:` note in `src/places/places.service.ts`.

**Licence:** Foursquare caps caching of Places Data by account type, and their
agreement also requires "Powered by Foursquare" attribution on every screen
where that data appears. `PLACES_CACHE_TTL_SECONDS` defaults to one hour for
that reason — check what this account's agreement allows before raising it.

## Queue

Deferred work runs on Vercel Queues (public beta). One topic so far,
`venue-candidates`: a places search publishes the venues it just saw, and a
consumer writes them into Happyen's own `venues` table. The search itself
returns without waiting for any of it.

| Piece    | Where                                   |
| -------- | --------------------------------------- |
| Contract | `src/queue/queue.client.ts`             |
| Producer | `PlacesService`, after a fresh search   |
| Job      | `src/queue/venue-ingest.job.ts`         |
| Consumer | `api/queues/venue-ingest.js`            |
| Trigger  | `experimentalTriggers` in `vercel.json` |

The consumer uses `handleNodeCallback`, the `(req, res)` form, because this
project's functions are plain Node handlers rather than framework route files.
The trigger makes it private: it has no public URL and only Vercel's queue
infrastructure can invoke it, so unlike the cron endpoints there is no shared
secret to check. Authentication is Vercel OIDC, so there is nothing to
add to any env file: on a deployment the token is injected automatically.

Locally, `vercel link && vercel env pull` writes `VERCEL_OIDC_TOKEN` into
`.env.local`, and `dev`, `start`, `start:uat` and `start:prod` load that file
when it exists. They load it **first** and the intended env file last, because
`vercel env pull` writes every project variable and last `--env-file` wins — so
a `DATABASE_URL` pulled from the Vercel project can never override the one you
asked for. Without the token, publishing fails and logs a warning; the search
still answers.

Delivery is at-least-once, so the job has to be safe to run twice. It is: the
write is an upsert keyed on `foursquare_place_id`, which the identity migration
made unique, and the producer passes the search's cache key as the message's
idempotency key so a repeated search enqueues nothing new.

Two failure modes are handled deliberately. A payload that will never parse is
acknowledged rather than retried to its TTL, and a message still failing on its
sixth delivery is acknowledged as poison. A failing _write_ is allowed to
throw, because that is the transient case worth redelivering.

Publishing is best effort at both ends: a queue that is unreachable never turns
a successful search into a failed request.

**Licence:** this writes Foursquare-derived data into Happyen's own table, which
is storage rather than caching, and their agreement limits both. The `venues`
row is provenance only — Happyen's row stays the source of truth — but confirm
what this account's agreement allows before leaning on it.

## Sign-in codes Happyen issues itself

`src/auth/otp/` holds the self-owned phone flow, alongside the Supabase one.
Three pieces: the `otp_challenges` table, `OtpService`, and
`SessionTokenService`.

### The code

Generated with `crypto.randomInt`, which is the CSPRNG and uniform over the
range. It is **not** derived from a clock. A timestamp gives uniqueness, not
unpredictability: the caller chooses when a code is minted, so a time-derived
code has a few thousand candidates instead of a million, and the attacker is
the one pressing "send".

Security is four properties together, none optional:

| Property       | How                                                 |
| -------------- | --------------------------------------------------- |
| Unpredictable  | `randomInt`, never `Math.random()` or `% 1_000_000` |
| Short-lived    | `expires_at`, five minutes                          |
| Single-use     | `consumed_at` claimed atomically                    |
| Attempt-capped | five tries, then the row is burned                  |

The code is never stored. `code_hash` is an HMAC keyed with `OTP_HASH_SECRET`
and bound to the number, so a hash lifted from one row cannot be replayed
against another. A bare hash would be theatre — six digits is a million
candidates and reverses instantly offline; keyed, it does not reverse at all.

Two tables, because their lifetimes differ. `otps` is the code in flight and is
disposable — `purge` deletes it once it expires. `otp_verifications` is the
permanent record of a code being used, and has to outlive it, which is why
`otp_id` is `ON DELETE SET NULL` rather than cascading and why the number is
copied onto the row. A purged code leaves its history intact, with the link
gone and the record readable on its own. There is a test for exactly that.

What is _not_ a second table is the mapping from a number to an account:
`user_identities` already holds `phone_e164` alongside `user_id`, and a second
copy would be two places that can disagree about who owns a number. That column
had no index, so this migration adds one — resolving a verified number to its
account is the step between the two tables here.

`otp_verifications.user_id` is nullable on purpose: at sign-up a number proves
itself before an account exists, and the row still records that it did.

Issuing a new code retires the previous one, because two live codes double an
attacker's odds for free. The single-use claim is
`UPDATE ... WHERE consumed_at IS NULL`, so two simultaneous verifications
cannot both succeed — there is a test that runs exactly that race.

### The session token

`SessionTokenService` signs **EdDSA (Ed25519)** with `jose`. Asymmetric rather
than a shared HS256 secret, so only the issuing deployment holds the private
key and anything else can verify without being able to mint — the property
`SupabaseTokenVerifier` already has, kept rather than traded away. The
verifying algorithm is pinned, so a token cannot arrive claiming `alg: none`.

**These are signed, not encrypted.** Signing proves the token came from here
and was not altered; it does not hide anything. Anyone holding the token can
base64-decode its claims. That is why the only claim is the user id, and there
is a test asserting the payload carries nothing else. Put nothing in a claim
that a reader should not see. If the claims themselves must be opaque, that is
JWE rather than JWS and a different change.

### The endpoints

| Route                       | Does                                                  |
| --------------------------- | ----------------------------------------------------- |
| `POST /v1/auth/otp/request` | Issues a code and sends it. 202.                      |
| `POST /v1/auth/otp/verify`  | Checks it, provisions the account, returns a session. |
| `POST /v1/auth/otp/refresh` | Rotates the refresh token, returns a new pair.        |
| `POST /v1/auth/otp/logout`  | Revokes one device's refresh token. 204.              |

`request` answers the same whether or not the number has an account, so it
cannot be used to ask who is registered. It is capped at three codes per number
per fifteen minutes, counted from the `otps` table itself rather than a
separate counter that could fail on its own — every send costs money, so this
endpoint is a spending endpoint. A send that fails discards its code, because a
message nobody received must not spend one of the caller's three tries.

`verify` provisions against `issuer: 'happyen'` with the number as the subject,
so the same phone always reaches the same account, and the existing
`user_identities` row is what links them.

### Refresh tokens

Opaque random strings, not JWTs: the one thing a refresh token must support is
revocation, and a self-contained token cannot be revoked without a table
anyway. Only the SHA-256 is stored — a plain digest here, unlike the OTP's
keyed HMAC, because 256 bits of entropy cannot be brute-forced the way six
digits can.

Every refresh burns the token it was given and returns a new one. That is what
makes theft detectable: the thief and the real client cannot both spend the
same token, so whichever comes second presents one already replaced. The
response is to revoke the **whole family**, because at that point the two
copies are indistinguishable.

A token that was revoked by sign-out is _not_ treated as theft — it has no
successor, so it is simply dead. Only a token with `replaced_by_id` set counts
as reuse. Without that distinction a stale client retrying after sign-out would
end every other session, which is exactly what the test for it caught.

Rotation is claimed conditionally (`WHERE revoked_at IS NULL`), so two
simultaneous refreshes cannot both mint a successor.

### Where the signing keys come from

Nowhere — you generate them. There is no provider and no package involved; the
private half of an Ed25519 keypair _is_ the signing key.

```bash
openssl genpkey -algorithm ed25519 -out key.pem
openssl pkey -in key.pem -pubout -out key.pub.pem
base64 -i key.pem && base64 -i key.pub.pem
```

Base64 of the PEM goes into `SESSION_JWT_PRIVATE_KEY` and
`SESSION_JWT_PUBLIC_KEY`; the config accepts either that or the raw PEM, since
a PEM's newlines do not survive an env file intact.

**A keypair per environment, never shared.** The key is the only thing deciding
which deployment a token belongs to, so one key across UAT and production would
make a UAT token valid in production. The issuer differs too, and both are
checked on verify. Rotating a key signs everyone in that environment out, which
is the correct behaviour for a compromised key.

On Vercel these are project environment variables, not files. Only a deployment
that issues tokens needs the private half.

### Two issuers, one guard

`CompositeTokenVerifier` tries Happyen's own token first, against a local key,
then Supabase's. Supabase sessions keep working unchanged. A Happyen token
names its account directly, so `ExternalIdentity.userId` is set and
`findByIdentity` skips the issuer-and-subject lookup.

### Degrading rather than refusing to boot

`OTP_HASH_SECRET` and `FAST2SMS_API_KEY` missing gives 503 on these routes
only. The application still starts and events, places and profile are
unaffected — configuration for sending codes has nothing to do with them.

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, import it as a new project. Leave the framework preset as Other;
   `vercel.json` supplies the build and routing.
3. Set these environment variables on the project:

   | Variable       | Value                                             |
   | -------------- | ------------------------------------------------- |
   | `DATABASE_URL` | Neon pooler URL (`-pooler` host)                  |
   | `DIRECT_URL`   | Neon direct URL (no `-pooler`)                    |
   | `CRON_SECRET`  | A long random string                              |
   | `HAPPYN_ENV`   | `production`                                      |
   | `LOG_LEVEL`    | `info`                                            |
   | `SUPABASE_URL` | Your Supabase project URL, for token verification |

4. Add `SUPABASE_DIRECT_URL` as a GitHub Actions secret so the `migrate` job can
   advance the schema on pushes to `main`. Until it is set, that job is skipped.

Vercel's own Git integration handles preview and production deploys. There is no
deploy job in CI, because duplicating it would fight the integration.

### How requests are routed

Vercel Functions run up to 300 seconds on Hobby and 800 seconds on Pro, which
also caps how long any single streamed response can stay open.

`vercel.json` rewrites `/v1/*` to `api/index.js`, which re-exports the compiled
handler in `dist/vercel.js`. That handler builds the Nest application once per
warm container and reuses it, so only cold starts pay the bootstrap cost. The
global route prefix is still `v1`, so paths are unchanged from local development.

### Scheduled jobs

The former `apps/workers` process is gone. Vercel has no long-lived processes, so
each job is a function under `api/cron/` with its schedule in `vercel.json`.

`CRON_SECRET` is required outside local development. Vercel sends it as
`Authorization: Bearer $CRON_SECRET`, and the endpoint refuses any request that
does not match, so the schedule cannot be triggered by anyone who learns the URL.

Every plan allows 100 cron jobs per project. The limit that matters is
frequency: Hobby fires each job at most once per day, with up to 59 minutes of
timing jitter, and a more frequent expression fails at deploy time. That is why
`heartbeat` is scheduled at `0 3 * * *`. Pro and Enterprise allow once per
minute with per-minute precision.

## Authentication

People sign in with a phone number and a one-time code. Supabase Auth owns that
credential and nothing else: `src/auth/supabase-token.verifier.ts` checks the
access token, and the account it belongs to — profile, username, privacy — lives
in this database, in `users`, `user_identities`, `profiles` and
`privacy_settings`.

Verification uses the project's **JWKS**, not its JWT secret, so this service
holds no key that could mint a token; it can only check one. `SUPABASE_URL` is
therefore the root of trust for every authenticated request, and a token from
any other project fails the issuer check. Key rotation needs no deploy —
`jose` re-fetches the key set on an unknown `kid`.

The flow is:

1. The app calls Supabase directly to request and verify the code.
2. With a session in hand it calls `POST /v1/auth/session`, which provisions the
   internal user on first sight and is idempotent afterwards.
3. A new account has `username: null`, which is how the app knows to ask for one.
   `GET /v1/me/username-available` drives the hint while typing, and
   `PATCH /v1/me/profile` claims it. The claim, not the check, is authoritative:
   the `profiles_username_lower_uq` index decides, and a loser gets `409
username_taken` rather than a 500.

Swapping identity providers again means replacing the verifier and the
`ExternalIdentity.issuer` literal; everything downstream of `AuthTokenVerifier`
is unaware of who issued the token. That is what made the move off Firebase a
one-file change here.

## What is not here

SMS delivery. Supabase sends the codes, and it needs an SMS provider configured
in the project (Twilio, MessageBird, Vonage, TextLocal, or any other through the
Send SMS hook). Indian numbers additionally need DLT registration with TRAI
before transactional SMS is delivered at all.

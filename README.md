# Happyen backend

The Happyen API and its scheduled jobs. Split out of the `Happyen` monorepo so it
can deploy independently to Vercel against Supabase Postgres. The Flutter client
lives in the other repository and only knows this service by its HTTPS origin.

- NestJS modular monolith on Express, served by a Vercel Function.
- Drizzle ORM over Postgres, with PostGIS for the geospatial work.
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

## Supabase

Supabase exposes two connection strings and this service needs both.

| Variable       | Port | Used by                     |
| -------------- | ---- | --------------------------- |
| `DATABASE_URL` | 6543 | Serverless request handling |
| `DIRECT_URL`   | 5432 | Migrations only             |

Port 6543 is the Supavisor transaction pooler. Serverless containers must go
through it, because each container holds its own connection and would otherwise
exhaust the project's connection limit. The pool size drops to one connection
per container automatically when `VERCEL` is set.

Migrations take locks and create types, which a transaction pooler cannot carry
across statements, so they always use the direct connection on port 5432.

Enable the extensions once per Supabase project, matching
`infrastructure/docker/postgres/init/001-extensions.sql`:

```sql
create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
```

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, import it as a new project. Leave the framework preset as Other;
   `vercel.json` supplies the build and routing.
3. Set these environment variables on the project:

   | Variable              | Value                                              |
   | --------------------- | -------------------------------------------------- |
   | `DATABASE_URL`        | Supabase pooler URL, port 6543                     |
   | `DIRECT_URL`          | Supabase direct URL, port 5432                     |
   | `CRON_SECRET`         | A long random string                               |
   | `HAPPYN_ENV`          | `production`                                       |
   | `LOG_LEVEL`           | `info`                                             |
   | `FIREBASE_PROJECT_ID` | Your Firebase project, for auth token verification |

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

## What is not here

Auth still verifies Firebase ID tokens through `firebase-admin`. Supabase is the
database only. Moving to Supabase Auth would replace `src/auth/firebase-token.verifier.ts`
and nothing else, because verification sits behind the `AuthTokenVerifier` port.

# Deployment

Planned environments are local, development, staging, and production. Each
environment gets its own Vercel project and its own Supabase project, so data
and credentials never cross a boundary. Configuration is validated at process
startup, and secrets belong in Vercel's environment variables rather than in the
repository.

The API is served by a Vercel Function and scheduled work runs as Vercel Cron
Functions. See the repository README for the connection strings, the cron
secret, and the migration job.

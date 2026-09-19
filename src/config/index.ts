import { z } from 'zod';

/** Accepts a PEM as written, or base64 of one, which survives an env file. */
function toPem(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.includes('-----BEGIN')) return value;
  return Buffer.from(value, 'base64').toString('utf8');
}

const environmentSchema = z.object({
  /**
   * Pooled connection string. On Supabase this is the Supavisor transaction
   * pooler on port 6543, which is what serverless functions must use.
   */
  DATABASE_URL: z.string().url(),
  /**
   * Direct connection string on port 5432. Migrations and any session-level
   * statement must use this, because the transaction pooler does not support
   * them.
   */
  DIRECT_URL: z.string().url().optional(),
  /**
   * Shared secret Vercel Cron sends as a bearer token. Required in production
   * so cron endpoints cannot be triggered by anyone with the URL.
   */
  CRON_SECRET: z.string().min(1).optional(),
  /**
   * Supabase project URL, e.g. https://abcdefgh.supabase.co. Access tokens are
   * verified against this project's JWKS, so it is the root of trust for every
   * authenticated request; a wrong value must fail closed rather than guess.
   */
  SUPABASE_URL: z.string().url().optional(),
  /**
   * Foursquare Places service key. Legacy v3 API keys are rejected by
   * places-api.foursquare.com; this must be a service key.
   */
  FOURSQUARE_API_KEY: z.string().min(1).optional(),
  /**
   * Fast2SMS key for delivering the Supabase-generated sign-in code. Route
   * `otp` needs no DLT registration and no sender id, and is India-only.
   */
  FAST2SMS_API_KEY: z.string().min(1).optional(),
  /**
   * Which Fast2SMS route delivers the code.
   *
   * `otp` is the cheaper one and needs no sender id or template, but the
   * account must pass Fast2SMS's website verification first. `q` (Quick SMS)
   * works without that and costs more per message, so it is the route to run
   * on until verification clears — a variable rather than a deploy.
   */
  FAST2SMS_ROUTE: z.enum(['otp', 'q']).default('otp'),
  /**
   * Pepper for the OTP HMAC. Six digits is a million candidates, so a bare
   * hash of a leaked table falls in seconds; keyed, it does not fall at all.
   * Rotating this invalidates every code in flight, which is harmless.
   */
  OTP_HASH_SECRET: z.string().min(16).optional(),
  /**
   * Ed25519 keys for sessions Happyen issues itself. Only the signing path
   * needs the private half, so a deployment given just the public key can
   * verify and still cannot mint.
   *
   * A PEM is accepted directly, but it carries newlines that env files handle
   * badly, so base64 of the PEM is accepted too and is the easier thing to
   * paste.
   */
  SESSION_JWT_PRIVATE_KEY: z.string().min(1).optional().transform(toPem),
  SESSION_JWT_PUBLIC_KEY: z.string().min(1).optional().transform(toPem),
  /**
   * Identifies which deployment minted a token, and is checked on verify. It
   * is a label, never fetched — but it must differ per environment, or a
   * staging token verifies in production. Defaults to the local server.
   */
  SESSION_JWT_ISSUER: z.string().url().default('http://localhost:3000'),
  SESSION_JWT_AUDIENCE: z.string().min(1).default('happyen-mobile'),
  /**
   * Upstash Redis over REST, injected by the Vercel integration. Both are
   * needed or the places cache stays off and every search goes upstream.
   */
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  /**
   * How long a Foursquare search may be reused. Their licence caps caching of
   * Places Data by account type, so this is deliberately short and deliberately
   * configurable: raise it only as far as the agreement for this account allows.
   */
  PLACES_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).default(3600),
  HAPPYN_ENV: z
    .enum(['local', 'development', 'staging', 'production'])
    .default('local'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * An environment variable that is present but empty is not set. A `.env`
 * template line, a Vercel variable left blank and an unset variable are the
 * same intent, and an optional field must not refuse the whole boot over the
 * difference — which is exactly what `SUPABASE_URL=` used to do.
 */
function omitBlank(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value?.trim() !== ''),
  );
}

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const present = omitBlank(input);
  const result = environmentSchema.safeParse({
    ...present,
    DATABASE_URL: present.DATABASE_URL ?? present.DB_URL,
  });

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration: ${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}

/** True when running inside a Vercel function rather than a long-lived server. */
export function isServerless(input: NodeJS.ProcessEnv = process.env): boolean {
  return (
    input.VERCEL === '1' || typeof input.AWS_LAMBDA_FUNCTION_NAME === 'string'
  );
}

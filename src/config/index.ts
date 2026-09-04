import { z } from 'zod';

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
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  HAPPYN_ENV: z
    .enum(['local', 'development', 'staging', 'production'])
    .default('local'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse({
    ...input,
    DATABASE_URL: input.DATABASE_URL ?? input.DB_URL,
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

import { z } from 'zod';

/**
 * Upstash over its REST API rather than a Redis client: a TCP connection per
 * serverless invocation is the same problem the Neon pooler solves for
 * Postgres, and the whole protocol here is one POST whose body is the command
 * as a JSON array. That is not worth a dependency.
 */
const commandSchema = z.object({ result: z.unknown() });

/**
 * A cache miss and a cache outage are the same answer — `null`. Whatever is
 * behind the cache is the source of truth, and a Redis that is down must not
 * take the feature down with it, so every failure here is swallowed rather
 * than raised.
 */
export class UpstashCache {
  public constructor(
    private readonly url: string,
    private readonly token: string,
    public readonly ttlSeconds: number,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  public async get(key: string): Promise<string | null> {
    const result = await this.command(['GET', key]);
    return typeof result === 'string' ? result : null;
  }

  public async set(key: string, value: string): Promise<void> {
    await this.command(['SET', key, value, 'EX', String(this.ttlSeconds)]);
  }

  private async command(command: string[]): Promise<unknown> {
    try {
      const response = await this.fetchImpl(this.url, {
        body: JSON.stringify(command),
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      });
      if (!response.ok) {
        return null;
      }
      const parsed = commandSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.result : null;
    } catch {
      return null;
    }
  }
}

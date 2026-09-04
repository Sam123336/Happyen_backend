import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'node:http';

import { createRequestListener } from './app.factory.js';

/**
 * A warm Vercel container reuses this module, so the Nest application is built
 * once per container and only cold starts pay the bootstrap cost.
 */
let cached: Promise<RequestListener> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  cached ??= createRequestListener();
  const listener = await cached;
  listener(request, response);
}

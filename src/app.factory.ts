import 'reflect-metadata';

import type { RequestListener } from 'node:http';

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';

/**
 * Builds the Nest application over an Express instance and returns that
 * instance, so the same application can be served by a long-lived listener
 * locally and by a per-request function on Vercel.
 */
export async function createRequestListener(): Promise<RequestListener> {
  const expressApp = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('v1');
  await app.init();

  return expressApp;
}

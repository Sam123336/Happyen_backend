import 'reflect-metadata';

import { parseEnvironment } from './config/index.js';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvironment } from 'dotenv';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';

loadEnvironment({ path: new URL('../.env', import.meta.url) });

async function bootstrap(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.setGlobalPrefix('v1');

  await app.listen(environment.PORT, '0.0.0.0');
}

void bootstrap();

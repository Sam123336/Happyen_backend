import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module.js';
import { parseEnvironment } from './config/index.js';
import { DatabaseModule } from './database/database.module.js';
import { EventsModule } from './events/events.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { PlacesModule } from './places/places.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    AuthModule,
    ProfileModule,
    EventsModule,
    PlacesModule,
    // `forRootAsync`, because the factory has to run after the entry point has
    // loaded `.env`: ESM hoists this import above that call, so anything read
    // at module scope here would see an empty environment locally.
    //
    // The level goes through `parseEnvironment` rather than `process.env`
    // directly. Read raw, an unexpected value reaches pino and it throws
    // "default level: must be included in custom levels" before the
    // application has a logger to report it with.
    LoggerModule.forRootAsync({
      useFactory: () => {
        const environment = parseEnvironment(process.env);
        return {
          pinoHttp: {
            autoLogging: true,
            base: {
              environment: environment.HAPPYN_ENV,
              service: 'happyn-api',
            },
            level: environment.LOG_LEVEL,
            messageKey: 'message',
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              remove: true,
            },
          },
        };
      },
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module.js';
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
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        base: {
          environment: process.env.HAPPYN_ENV ?? 'local',
          service: 'happyn-api',
        },
        level: process.env.LOG_LEVEL ?? 'info',
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
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}

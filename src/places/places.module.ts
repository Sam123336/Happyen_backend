import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { parseEnvironment } from '../config/index.js';
import { PlacesCache } from './places.cache.js';
import { PlacesController } from './places.controller.js';
import { PlacesService } from './places.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PlacesController],
  providers: [
    {
      provide: PlacesService,
      useFactory: (): PlacesService => {
        const environment = parseEnvironment(process.env);
        // Without both Upstash variables there is no cache, and every search
        // goes upstream exactly as it did before.
        const cache =
          environment.UPSTASH_REDIS_REST_URL === undefined ||
          environment.UPSTASH_REDIS_REST_TOKEN === undefined
            ? undefined
            : new PlacesCache(
                environment.UPSTASH_REDIS_REST_URL,
                environment.UPSTASH_REDIS_REST_TOKEN,
                environment.PLACES_CACHE_TTL_SECONDS,
              );
        return new PlacesService(
          environment.FOURSQUARE_API_KEY,
          globalThis.fetch,
          cache,
        );
      },
    },
  ],
  exports: [PlacesService],
})
export class PlacesModule {}

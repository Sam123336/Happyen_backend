import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { parseEnvironment } from '../config/index.js';
import { PlacesController } from './places.controller.js';
import { PlacesService } from './places.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PlacesController],
  providers: [
    {
      provide: PlacesService,
      useFactory: (): PlacesService =>
        new PlacesService(parseEnvironment(process.env).FOURSQUARE_API_KEY),
    },
  ],
  exports: [PlacesService],
})
export class PlacesModule {}

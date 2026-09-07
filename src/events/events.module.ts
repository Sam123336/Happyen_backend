import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { EventRepository } from './event.repository.js';
import { EventsController } from './events.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [EventRepository],
  exports: [EventRepository],
})
export class EventsModule {}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { ExternalAuthGuard } from '../auth/external-auth.guard.js';
import { ProvisionedUserGuard } from '../auth/provisioned-user.guard.js';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe.js';
import { EventRepository } from './event.repository.js';
import type { EventPin } from './event.types.js';
import { nearbyQuerySchema, type NearbyQuery } from './events.schemas.js';

@Controller('events')
@UseGuards(ExternalAuthGuard, ProvisionedUserGuard)
export class EventsController {
  public constructor(private readonly events: EventRepository) {}

  @Get('nearby')
  public nearby(
    @Query(
      new ZodValidationPipe(nearbyQuerySchema, 'The query string is invalid'),
    )
    query: NearbyQuery,
  ): Promise<EventPin[]> {
    return this.events.nearby({
      ...(query.category === undefined ? {} : { category: query.category }),
      includeLive: query.include_live,
      latitude: query.lat,
      limit: query.limit,
      longitude: query.lng,
      radiusMeters: query.radius_m,
      startsAfter: query.starts_after ?? new Date(),
      ...(query.starts_before === undefined
        ? {}
        : { startsBefore: query.starts_before }),
    });
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { ExternalAuthGuard } from '../auth/external-auth.guard.js';
import { ProvisionedUserGuard } from '../auth/provisioned-user.guard.js';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe.js';
import { PlacesService, type Place } from './places.service.js';

const searchQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    lng: z.coerce.number().min(-180).max(180),
    query: z.string().trim().min(1).max(120).optional(),
    radius_m: z.coerce.number().int().min(1).max(100_000).optional(),
  })
  .strict();

@Controller('places')
@UseGuards(ExternalAuthGuard, ProvisionedUserGuard)
export class PlacesController {
  public constructor(private readonly places: PlacesService) {}

  @Get('search')
  public search(
    @Query(
      new ZodValidationPipe(searchQuerySchema, 'The query string is invalid'),
    )
    query: z.infer<typeof searchQuerySchema>,
  ): Promise<Place[]> {
    return this.places.search({
      latitude: query.lat,
      limit: query.limit,
      longitude: query.lng,
      ...(query.query === undefined ? {} : { query: query.query }),
      ...(query.radius_m === undefined ? {} : { radiusMeters: query.radius_m }),
    });
  }
}

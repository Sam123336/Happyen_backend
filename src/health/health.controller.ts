import { Controller, Get } from '@nestjs/common';

import {
  HealthService,
  type HealthStatus,
  type ReadinessStatus,
} from './health.service.js';

@Controller('health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get('live')
  public live(): HealthStatus {
    return this.healthService.liveness();
  }

  @Get('ready')
  public ready(): Promise<ReadinessStatus> {
    return this.healthService.readiness();
  }
}

import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

export interface HealthStatus {
  service: 'happyn-api';
  status: 'ok';
}

export interface ReadinessStatus extends HealthStatus {
  dependencies: {
    database: 'up';
  };
}

@Injectable()
export class HealthService {
  public constructor(private readonly database: DatabaseService) {}

  public liveness(): HealthStatus {
    return {
      service: 'happyn-api',
      status: 'ok',
    };
  }

  public async readiness(): Promise<ReadinessStatus> {
    try {
      await this.database.ping();
      return {
        dependencies: { database: 'up' },
        service: 'happyn-api',
        status: 'ok',
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'database_unavailable',
        message: 'The database is unavailable',
      });
    }
  }
}

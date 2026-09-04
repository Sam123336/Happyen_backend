import { Controller, Post, Req, UseGuards } from '@nestjs/common';

import { UserRepository } from '../users/user.repository.js';
import type { ExternalIdentityRequest } from './authenticated-request.js';
import { ExternalAuthGuard } from './external-auth.guard.js';

@Controller('auth')
export class AuthSessionController {
  public constructor(private readonly users: UserRepository) {}

  @Post('session')
  @UseGuards(ExternalAuthGuard)
  public createSession(@Req() request: ExternalIdentityRequest) {
    return this.users.provision(request.externalIdentity);
  }
}

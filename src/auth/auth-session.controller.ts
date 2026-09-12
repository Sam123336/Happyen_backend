import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/http/zod-validation.pipe.js';
import { activeDay, isoDayPattern } from '../users/streak.js';
import { UserRepository } from '../users/user.repository.js';
import type { ExternalIdentityRequest } from './authenticated-request.js';
import { ExternalAuthGuard } from './external-auth.guard.js';

/** Older clients send no body at all; that still counts as opening the city. */
const createSessionSchema = z
  .object({ localDate: z.string().regex(isoDayPattern).optional() })
  .strict()
  .optional();

@Controller('auth')
export class AuthSessionController {
  public constructor(private readonly users: UserRepository) {}

  @Post('session')
  @UseGuards(ExternalAuthGuard)
  public createSession(
    @Req() request: ExternalIdentityRequest,
    @Body(new ZodValidationPipe(createSessionSchema))
    body: z.infer<typeof createSessionSchema>,
  ) {
    return this.users.provision(
      request.externalIdentity,
      activeDay(body?.localDate),
    );
  }
}

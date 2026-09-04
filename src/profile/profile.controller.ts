import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { z } from 'zod';

import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { ExternalAuthGuard } from '../auth/external-auth.guard.js';
import { ProvisionedUserGuard } from '../auth/provisioned-user.guard.js';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe.js';
import { UserRepository } from '../users/user.repository.js';
import { updatePrivacySchema, updateProfileSchema } from './profile.schemas.js';

@Controller('me')
@UseGuards(ExternalAuthGuard, ProvisionedUserGuard)
export class ProfileController {
  public constructor(private readonly users: UserRepository) {}

  @Get('profile')
  public getProfile(@Req() request: AuthenticatedRequest) {
    return request.currentUser;
  }

  @Patch('profile')
  public updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(updateProfileSchema))
    input: z.infer<typeof updateProfileSchema>,
  ) {
    return this.users.updateProfile(request.currentUser.userId, input);
  }

  @Patch('privacy')
  public updatePrivacy(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(updatePrivacySchema))
    input: z.infer<typeof updatePrivacySchema>,
  ) {
    return this.users.updatePrivacy(request.currentUser.userId, input);
  }
}

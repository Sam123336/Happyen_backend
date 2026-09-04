import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import { UserRepository } from '../users/user.repository.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

@Injectable()
export class ProvisionedUserGuard implements CanActivate {
  public constructor(private readonly users: UserRepository) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.users.findByIdentity(request.externalIdentity);

    if (user === null) {
      throw new UnauthorizedException({
        code: 'session_not_provisioned',
        message: 'Create an application session before accessing this resource',
      });
    }
    if (user.status !== 'active') {
      throw new ForbiddenException({
        code: 'account_unavailable',
        message: 'This account is not active',
      });
    }

    request.currentUser = user;
    return true;
  }
}

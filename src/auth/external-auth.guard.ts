import {
  CanActivate,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  AUTH_TOKEN_VERIFIER,
  type AuthTokenVerifier,
} from './auth-token-verifier.js';
import type { ExternalIdentityRequest } from './authenticated-request.js';

@Injectable()
export class ExternalAuthGuard implements CanActivate {
  public constructor(
    @Inject(AUTH_TOKEN_VERIFIER) private readonly verifier: AuthTokenVerifier,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header('authorization');
    const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');

    if (match?.[1] === undefined) {
      throw new UnauthorizedException({
        code: 'missing_bearer_token',
        message: 'A Firebase ID token is required',
      });
    }

    try {
      const identity = await this.verifier.verify(match[1]);
      (request as ExternalIdentityRequest).externalIdentity = identity;
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('not configured')) {
        throw new ServiceUnavailableException({
          code: 'identity_service_not_configured',
          message: 'Identity verification is not configured',
        });
      }
      throw new UnauthorizedException({
        code: 'invalid_identity_token',
        message: 'The identity token is invalid or expired',
      });
    }
  }
}

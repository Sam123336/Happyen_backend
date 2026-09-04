import { Module } from '@nestjs/common';
import { parseEnvironment } from '../config/index.js';

import { UsersModule } from '../users/users.module.js';
import { AuthSessionController } from './auth-session.controller.js';
import { AUTH_TOKEN_VERIFIER } from './auth-token-verifier.js';
import { ExternalAuthGuard } from './external-auth.guard.js';
import { FirebaseTokenVerifier } from './firebase-token.verifier.js';
import { ProvisionedUserGuard } from './provisioned-user.guard.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthSessionController],
  providers: [
    {
      provide: AUTH_TOKEN_VERIFIER,
      useFactory: () =>
        new FirebaseTokenVerifier(
          parseEnvironment(process.env).FIREBASE_PROJECT_ID,
        ),
    },
    ExternalAuthGuard,
    ProvisionedUserGuard,
  ],
  exports: [AUTH_TOKEN_VERIFIER, ExternalAuthGuard, ProvisionedUserGuard],
})
export class AuthModule {}

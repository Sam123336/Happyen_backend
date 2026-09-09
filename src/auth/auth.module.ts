import { Module } from '@nestjs/common';
import { parseEnvironment } from '../config/index.js';

import { UsersModule } from '../users/users.module.js';
import { AuthSessionController } from './auth-session.controller.js';
import { AUTH_TOKEN_VERIFIER } from './auth-token-verifier.js';
import { ExternalAuthGuard } from './external-auth.guard.js';
import { SupabaseTokenVerifier } from './supabase-token.verifier.js';
import { ProvisionedUserGuard } from './provisioned-user.guard.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthSessionController],
  providers: [
    {
      provide: AUTH_TOKEN_VERIFIER,
      useFactory: () =>
        new SupabaseTokenVerifier(parseEnvironment(process.env).SUPABASE_URL),
    },
    ExternalAuthGuard,
    ProvisionedUserGuard,
  ],
  // A guard named in @UseGuards is instantiated in the module hosting the
  // controller, so its own dependencies must resolve there. Re-exporting
  // UsersModule gives every AuthModule importer the UserRepository that
  // ProvisionedUserGuard needs, rather than each one importing it again.
  exports: [
    AUTH_TOKEN_VERIFIER,
    ExternalAuthGuard,
    ProvisionedUserGuard,
    UsersModule,
  ],
})
export class AuthModule {}

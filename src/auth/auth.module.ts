import { Module } from '@nestjs/common';

import { parseEnvironment } from '../config/index.js';
import { UsersModule } from '../users/users.module.js';
import { AuthSessionController } from './auth-session.controller.js';
import { AUTH_TOKEN_VERIFIER } from './auth-token-verifier.js';
import { ExternalAuthGuard } from './external-auth.guard.js';
import {
  CompositeTokenVerifier,
  HappyenTokenVerifier,
} from './otp/happyen-token.verifier.js';
import { OtpAuthController } from './otp/otp-auth.controller.js';
import { OtpService } from './otp/otp.service.js';
import { RefreshTokenService } from './otp/refresh-token.service.js';
import { SessionTokenService } from './otp/session-token.service.js';
import { ProvisionedUserGuard } from './provisioned-user.guard.js';
import { Fast2SmsSender } from './sms/fast2sms.sender.js';
import { SupabaseTokenVerifier } from './supabase-token.verifier.js';

function sessions(): SessionTokenService {
  const environment = parseEnvironment(process.env);
  return new SessionTokenService(
    environment.SESSION_JWT_ISSUER,
    environment.SESSION_JWT_AUDIENCE,
    environment.SESSION_JWT_PRIVATE_KEY,
    environment.SESSION_JWT_PUBLIC_KEY,
  );
}

@Module({
  imports: [UsersModule],
  controllers: [AuthSessionController, OtpAuthController],
  providers: [
    {
      provide: SessionTokenService,
      useFactory: sessions,
    },
    // Missing configuration must not stop the application booting: these
    // answer 503 on their own routes and leave the rest of the API alone.
    {
      provide: OtpService,
      useFactory: (): OtpService =>
        new OtpService(parseEnvironment(process.env).OTP_HASH_SECRET),
    },
    {
      provide: Fast2SmsSender,
      useFactory: (): Fast2SmsSender => {
        const environment = parseEnvironment(process.env);
        return new Fast2SmsSender(
          environment.FAST2SMS_API_KEY,
          globalThis.fetch,
          environment.FAST2SMS_ROUTE,
        );
      },
    },
    {
      provide: RefreshTokenService,
      useFactory: () => new RefreshTokenService(),
    },
    {
      // Both issuers behind one guard: Supabase's tokens keep working while
      // Happyen's own are accepted too.
      provide: AUTH_TOKEN_VERIFIER,
      useFactory: () =>
        new CompositeTokenVerifier([
          new HappyenTokenVerifier(sessions()),
          new SupabaseTokenVerifier(parseEnvironment(process.env).SUPABASE_URL),
        ]),
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

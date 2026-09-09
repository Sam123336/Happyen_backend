import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { AuthTokenVerifier } from './auth-token-verifier.js';
import type { ExternalIdentity } from './external-identity.js';

/**
 * Verifies a Supabase Auth access token.
 *
 * Supabase signs access tokens with asymmetric keys published at the project's
 * JWKS endpoint, so this never needs the project's JWT secret and nothing here
 * can mint a token — it can only check one. `createRemoteJWKSet` fetches and
 * caches the key set, and re-fetches on an unknown `kid`, which is what makes
 * Supabase's key rotation a non-event.
 */
export class SupabaseTokenVerifier implements AuthTokenVerifier {
  private readonly issuer: string | undefined;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  public constructor(supabaseUrl?: string) {
    if (supabaseUrl === undefined) return;
    const origin = new URL(supabaseUrl).origin;
    this.issuer = `${origin}/auth/v1`;
    this.jwks = createRemoteJWKSet(
      new URL(`${origin}/auth/v1/.well-known/jwks.json`),
    );
  }

  public async verify(token: string): Promise<ExternalIdentity> {
    const jwks = this.jwks;
    const issuer = this.issuer;
    if (jwks === undefined || issuer === undefined) {
      throw new Error('SUPABASE_URL is not configured');
    }

    const { payload } = await jwtVerify(token, jwks, {
      audience: 'authenticated',
      issuer,
    });

    // A token whose subject is missing is not a user token; refuse rather than
    // provision an account against an empty subject.
    const subject = payload.sub;
    if (subject === undefined || subject.length === 0) {
      throw new Error('The verified token carries no subject');
    }

    const email = this.claimString(payload, 'email');
    const phoneE164 = this.phoneE164(payload);
    if (email === undefined && phoneE164 === undefined) {
      throw new Error(
        'The verified identity has no email address or phone number',
      );
    }

    const metadata = this.userMetadata(payload);
    const avatarUrl =
      this.claimString(metadata, 'avatar_url') ??
      this.claimString(metadata, 'picture');
    const displayName =
      this.claimString(metadata, 'full_name') ??
      this.claimString(metadata, 'name');

    const signInProvider = this.signInProvider(payload);

    return {
      ...(avatarUrl === undefined ? {} : { avatarUrl }),
      ...(displayName === undefined ? {} : { displayName }),
      ...(email === undefined ? {} : { email }),
      emailVerified: this.isVerified(metadata, 'email_verified'),
      issuer: 'supabase',
      ...(phoneE164 === undefined ? {} : { phoneE164 }),
      ...(signInProvider === undefined ? {} : { signInProvider }),
      subject,
    };
  }

  /**
   * Supabase stores the phone as bare digits with no `+`, while the database
   * column and every client expect E.164.
   */
  private phoneE164(payload: JWTPayload): string | undefined {
    const phone = this.claimString(payload, 'phone');
    if (phone === undefined) return undefined;
    return phone.startsWith('+') ? phone : `+${phone}`;
  }

  private signInProvider(payload: JWTPayload): string | undefined {
    const appMetadata = payload['app_metadata'];
    if (typeof appMetadata !== 'object' || appMetadata === null) {
      return undefined;
    }
    return this.claimString(appMetadata as Record<string, unknown>, 'provider');
  }

  private userMetadata(payload: JWTPayload): Record<string, unknown> {
    const metadata = payload['user_metadata'];
    return typeof metadata === 'object' && metadata !== null
      ? (metadata as Record<string, unknown>)
      : {};
  }

  private claimString(
    source: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = source[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private isVerified(source: Record<string, unknown>, key: string): boolean {
    return source[key] === true;
  }
}

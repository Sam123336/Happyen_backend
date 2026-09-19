import type { AuthTokenVerifier } from '../auth-token-verifier.js';
import type { ExternalIdentity } from '../external-identity.js';
import type { SessionTokenService } from './session-token.service.js';

/** Turns a Happyen-issued access token into the identity the guards expect. */
export class HappyenTokenVerifier implements AuthTokenVerifier {
  public constructor(private readonly tokens: SessionTokenService) {}

  public async verify(token: string): Promise<ExternalIdentity> {
    const { userId } = await this.tokens.verify(token);
    return {
      emailVerified: false,
      issuer: 'happyen',
      subject: userId,
      userId,
    };
  }
}

/**
 * Two issuers, one guard. Happyen's own token is tried first because it checks
 * against a local key, while Supabase's may reach for the JWKS; a token that is
 * neither fails as one invalid token rather than two.
 */
export class CompositeTokenVerifier implements AuthTokenVerifier {
  public constructor(private readonly verifiers: AuthTokenVerifier[]) {}

  public async verify(token: string): Promise<ExternalIdentity> {
    let lastError: unknown = new Error('No identity verifier is configured');

    for (const verifier of this.verifiers) {
      try {
        return await verifier.verify(token);
      } catch (error: unknown) {
        // "not configured" must keep its meaning, so the guard can still tell
        // a missing setup from a bad token.
        if (
          error instanceof Error &&
          error.message.includes('not configured')
        ) {
          continue;
        }
        lastError = error;
      }
    }
    throw lastError;
  }
}

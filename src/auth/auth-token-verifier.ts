import type { ExternalIdentity } from './external-identity.js';

export const AUTH_TOKEN_VERIFIER = Symbol('AUTH_TOKEN_VERIFIER');

export interface AuthTokenVerifier {
  verify(token: string): Promise<ExternalIdentity>;
}

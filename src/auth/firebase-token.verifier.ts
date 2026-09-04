import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import type { AuthTokenVerifier } from './auth-token-verifier.js';
import type { ExternalIdentity } from './external-identity.js';

export class FirebaseTokenVerifier implements AuthTokenVerifier {
  public constructor(private readonly projectId?: string) {}

  public async verify(token: string): Promise<ExternalIdentity> {
    if (this.projectId === undefined) {
      throw new Error('FIREBASE_PROJECT_ID is not configured');
    }

    const decoded = await getAuth(this.firebaseApp()).verifyIdToken(token);
    const claims = decoded as Record<string, unknown>;
    const email = decoded.email;
    const phoneE164 = decoded.phone_number;
    const avatarUrl =
      typeof claims['picture'] === 'string' ? claims['picture'] : undefined;
    const displayName =
      typeof claims['name'] === 'string' ? claims['name'] : undefined;
    const firebaseClaim: unknown = claims['firebase'];
    const signInProvider = this.signInProvider(firebaseClaim);

    if (email === undefined && phoneE164 === undefined) {
      throw new Error(
        'The verified identity has no email address or phone number',
      );
    }

    return {
      ...(avatarUrl === undefined ? {} : { avatarUrl }),
      ...(displayName === undefined ? {} : { displayName }),
      ...(email === undefined ? {} : { email }),
      emailVerified: decoded.email_verified === true,
      issuer: 'firebase',
      ...(phoneE164 === undefined ? {} : { phoneE164 }),
      ...(typeof signInProvider === 'string' ? { signInProvider } : {}),
      subject: decoded.uid,
    };
  }

  private signInProvider(firebaseClaim: unknown): string | undefined {
    if (typeof firebaseClaim !== 'object' || firebaseClaim === null) {
      return undefined;
    }
    const candidate = (firebaseClaim as Record<string, unknown>)[
      'sign_in_provider'
    ];
    return typeof candidate === 'string' ? candidate : undefined;
  }

  private firebaseApp(): App {
    const projectId = this.projectId;
    if (projectId === undefined) {
      throw new Error('FIREBASE_PROJECT_ID is not configured');
    }
    const name = `happyn-api-${projectId}`;
    return getApps().some((app) => app.name === name)
      ? getApp(name)
      : initializeApp({ projectId }, name);
  }
}

import { SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';

/**
 * Sessions issued by Happyen itself, for the phone flow it now owns.
 *
 * EdDSA rather than a shared HS256 secret: only the issuing path holds the
 * private key, so verification elsewhere needs the public half and still
 * cannot mint anything. That is the property `SupabaseTokenVerifier` has, kept
 * rather than traded away.
 *
 * These are *signed*, not encrypted. Signing proves the token came from here
 * and was not altered; it does not hide the payload, and anyone holding the
 * token can read its claims. That is why the only claim is the user id — put
 * nothing in here that a reader should not see.
 */
const ALGORITHM = 'EdDSA';

export interface SessionClaims {
  expiresAt: Date;
  userId: string;
}

export class SessionTokenService {
  private privateKey: Promise<CryptoKey> | undefined;
  private publicKey: Promise<CryptoKey> | undefined;

  public constructor(
    private readonly issuer: string,
    private readonly audience: string,
    private readonly privateKeyPem?: string,
    private readonly publicKeyPem?: string,
    private readonly ttlSeconds = 15 * 60,
  ) {}

  public async sign(userId: string): Promise<string> {
    if (this.privateKeyPem === undefined) {
      throw new Error('SESSION_JWT_PRIVATE_KEY is not configured');
    }
    this.privateKey ??= importPKCS8(this.privateKeyPem, ALGORITHM);
    const issuedAt = Math.floor(Date.now() / 1000);

    return new SignJWT({})
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.ttlSeconds)
      .sign(await this.privateKey);
  }

  public async verify(token: string): Promise<SessionClaims> {
    if (this.publicKeyPem === undefined) {
      throw new Error('SESSION_JWT_PUBLIC_KEY is not configured');
    }
    this.publicKey ??= importSPKI(this.publicKeyPem, ALGORITHM);

    const { payload } = await jwtVerify(token, await this.publicKey, {
      // Pinned, so a token cannot arrive claiming `alg: none` or a symmetric
      // algorithm and be checked against the key as if it were a secret.
      algorithms: [ALGORITHM],
      audience: this.audience,
      issuer: this.issuer,
    });

    const subject = payload.sub;
    if (subject === undefined || subject.length === 0) {
      throw new Error('The verified token carries no subject');
    }
    return {
      expiresAt: new Date((payload.exp ?? 0) * 1000),
      userId: subject,
    };
  }
}

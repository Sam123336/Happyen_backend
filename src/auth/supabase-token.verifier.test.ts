import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SupabaseTokenVerifier } from './supabase-token.verifier.js';

/**
 * Stands in for a Supabase project: serves a real JWKS over HTTP so the
 * verifier does the same signature check it does in production. A verifier
 * that only ever saw hand-made payloads would prove nothing about the part
 * that matters.
 */
let server: Server;
let origin: string;
let signingKey: CryptoKey;
let otherKey: CryptoKey;

async function sign(
  claims: Record<string, unknown>,
  options: { audience?: string; issuer?: string; key?: CryptoKey } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .setIssuer(options.issuer ?? `${origin}/auth/v1`)
    .setAudience(options.audience ?? 'authenticated')
    .sign(options.key ?? signingKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  signingKey = pair.privateKey;
  otherKey = (await generateKeyPair('ES256', { extractable: true })).privateKey;

  const jwk: JWK = await exportJWK(pair.publicKey);
  const body = JSON.stringify({
    keys: [{ ...jwk, alg: 'ES256', kid: 'test-key', use: 'sig' }],
  });

  server = createServer((request, response) => {
    if (request.url === '/auth/v1/.well-known/jwks.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(body);
      return;
    }
    response.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

describe('SupabaseTokenVerifier', () => {
  it('maps a phone identity, restoring the + Supabase omits', async () => {
    const verifier = new SupabaseTokenVerifier(origin);

    const identity = await verifier.verify(
      await sign({
        app_metadata: { provider: 'phone' },
        phone: '919876543210',
        sub: 'b3f1c2d4-0000-4000-8000-000000000001',
        user_metadata: { full_name: 'Sam' },
      }),
    );

    expect(identity).toMatchObject({
      displayName: 'Sam',
      issuer: 'supabase',
      phoneE164: '+919876543210',
      signInProvider: 'phone',
      subject: 'b3f1c2d4-0000-4000-8000-000000000001',
    });
  });

  it('rejects a token signed by anyone else', async () => {
    const verifier = new SupabaseTokenVerifier(origin);

    await expect(
      verifier.verify(
        await sign({ phone: '919876543210', sub: 'u1' }, { key: otherKey }),
      ),
    ).rejects.toThrow();
  });

  it('rejects a token minted for another Supabase project', async () => {
    const verifier = new SupabaseTokenVerifier(origin);

    await expect(
      verifier.verify(
        await sign(
          { phone: '919876543210', sub: 'u1' },
          { issuer: 'https://someone-else.supabase.co/auth/v1' },
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects a token with no subject or no contact detail', async () => {
    const verifier = new SupabaseTokenVerifier(origin);

    await expect(
      verifier.verify(await sign({ phone: '919876543210' })),
    ).rejects.toThrow(/subject/i);
    await expect(verifier.verify(await sign({ sub: 'u1' }))).rejects.toThrow(
      /email address or phone number/i,
    );
  });

  it('fails closed when SUPABASE_URL is unset', async () => {
    await expect(new SupabaseTokenVerifier().verify('any')).rejects.toThrow(
      /not configured/i,
    );
  });
});

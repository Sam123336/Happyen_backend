import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SessionTokenService } from './session-token.service.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pem = {
  private: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  public: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
};

const service = (ttl = 900) =>
  new SessionTokenService(
    'https://api.happyen.test',
    'happyen-mobile',
    pem.private,
    pem.public,
    ttl,
  );

const userId = '11111111-1111-4111-8111-000000000001';

describe('SessionTokenService', () => {
  it('signs a token this service can verify', async () => {
    const token = await service().sign(userId);

    await expect(service().verify(token)).resolves.toMatchObject({ userId });
  });

  it('carries the user id and nothing else, because claims are readable', async () => {
    const token = await service().sign(userId);
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1]!, 'base64url').toString(),
    ) as Record<string, unknown>;

    // Signed is not encrypted: anyone holding this can read the payload.
    expect(Object.keys(claims).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'iss',
      'sub',
    ]);
  });

  it('refuses a token signed by a different key', async () => {
    const other = generateKeyPairSync('ed25519');
    const forged = await new SessionTokenService(
      'https://api.happyen.test',
      'happyen-mobile',
      other.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      pem.public,
    ).sign(userId);

    await expect(service().verify(forged)).rejects.toThrow();
  });

  it('refuses a token whose payload was edited', async () => {
    const token = await service().sign(userId);
    const [header, , signature] = token.split('.');
    const swapped = Buffer.from(
      JSON.stringify({ sub: 'someone-else' }),
    ).toString('base64url');

    await expect(
      service().verify(`${header}.${swapped}.${signature}`),
    ).rejects.toThrow();
  });

  it('refuses an expired token', async () => {
    const token = await service(-1).sign(userId);

    await expect(service().verify(token)).rejects.toThrow();
  });

  it('refuses a token minted for another audience', async () => {
    const token = await new SessionTokenService(
      'https://api.happyen.test',
      'someone-elses-app',
      pem.private,
      pem.public,
    ).sign(userId);

    await expect(service().verify(token)).rejects.toThrow();
  });

  it('cannot sign without a private key, so a verifier-only deploy cannot mint', async () => {
    await expect(
      new SessionTokenService('i', 'a', undefined, pem.public).sign(userId),
    ).rejects.toThrow('SESSION_JWT_PRIVATE_KEY is not configured');
  });
});

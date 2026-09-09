import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { UserRepository } from '../users/user.repository.js';
import type { UserProfileView } from '../users/user.types.js';
import type { AuthTokenVerifier } from './auth-token-verifier.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { ExternalAuthGuard } from './external-auth.guard.js';
import { ProvisionedUserGuard } from './provisioned-user.guard.js';

const identity = {
  email: 'person@example.com',
  emailVerified: true,
  issuer: 'supabase' as const,
  subject: 'supabase-user-1',
};

const activeUser: UserProfileView = {
  avatarUrl: null,
  bio: null,
  displayName: 'Person',
  email: identity.email,
  emailVerified: true,
  momentsVisibility: 'friends',
  phoneE164: null,
  presenceVisibility: 'nobody',
  profileVisibility: 'everyone',
  status: 'active',
  userId: 'd8184dae-d19c-4d8a-9e36-9ce003cf2f5a',
  username: null,
};

function contextFor(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('ExternalAuthGuard', () => {
  it('verifies a bearer token and attaches the identity', async () => {
    const verify = vi.fn().mockResolvedValue(identity);
    const verifier: AuthTokenVerifier = {
      verify,
    };
    const request = { header: vi.fn().mockReturnValue('Bearer valid-token') };

    await expect(
      new ExternalAuthGuard(verifier).canActivate(contextFor(request)),
    ).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('valid-token');
    expect(request).toMatchObject({ externalIdentity: identity });
  });

  it('rejects a request without a bearer token', async () => {
    const verifier: AuthTokenVerifier = { verify: vi.fn() };
    const request = { header: vi.fn().mockReturnValue(undefined) };

    await expect(
      new ExternalAuthGuard(verifier).canActivate(contextFor(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('ProvisionedUserGuard', () => {
  it('attaches an active application user', async () => {
    const users = {
      findByIdentity: vi.fn().mockResolvedValue(activeUser),
    } as unknown as UserRepository;
    const request = { externalIdentity: identity } as AuthenticatedRequest;

    await expect(
      new ProvisionedUserGuard(users).canActivate(contextFor(request)),
    ).resolves.toBe(true);
    expect(request.currentUser).toEqual(activeUser);
  });

  it('rejects a suspended application user', async () => {
    const users = {
      findByIdentity: vi
        .fn()
        .mockResolvedValue({ ...activeUser, status: 'suspended' }),
    } as unknown as UserRepository;
    const request = { externalIdentity: identity } as AuthenticatedRequest;

    await expect(
      new ProvisionedUserGuard(users).canActivate(contextFor(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

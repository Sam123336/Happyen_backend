import type { Request } from 'express';

import type { UserProfileView } from '../users/user.types.js';
import type { ExternalIdentity } from './external-identity.js';

export interface ExternalIdentityRequest extends Request {
  externalIdentity: ExternalIdentity;
}

export interface AuthenticatedRequest extends ExternalIdentityRequest {
  currentUser: UserProfileView;
}

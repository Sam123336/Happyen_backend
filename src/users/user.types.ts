export type PrivacyAudience = 'nobody' | 'friends' | 'everyone';

export interface UserProfileView {
  avatarUrl: string | null;
  bio: string | null;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  momentsVisibility: PrivacyAudience;
  phoneE164: string | null;
  presenceVisibility: PrivacyAudience;
  profileVisibility: PrivacyAudience;
  status: 'active' | 'suspended' | 'deleted';
  userId: string;
  username: string | null;
}

export interface UpdateProfileInput {
  bio?: string | null | undefined;
  displayName?: string | undefined;
  username?: string | null | undefined;
}

export interface UpdatePrivacyInput {
  momentsVisibility?: PrivacyAudience | undefined;
  presenceVisibility?: PrivacyAudience | undefined;
  profileVisibility?: PrivacyAudience | undefined;
}

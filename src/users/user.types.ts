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
  /** Days in a row the city was opened, ending on `streakLastActiveOn`. */
  streakDays: number;
  /** ISO calendar day (`YYYY-MM-DD`) of the last opening, phone-local. */
  streakLastActiveOn: string | null;
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

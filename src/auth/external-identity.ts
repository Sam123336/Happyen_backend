export interface ExternalIdentity {
  avatarUrl?: string;
  displayName?: string;
  email?: string;
  emailVerified: boolean;
  issuer: 'supabase';
  phoneE164?: string;
  signInProvider?: string;
  subject: string;
}

export interface ExternalIdentity {
  avatarUrl?: string;
  displayName?: string;
  email?: string;
  emailVerified: boolean;
  issuer: 'firebase';
  phoneE164?: string;
  signInProvider?: string;
  subject: string;
}

export interface ExternalIdentity {
  avatarUrl?: string;
  displayName?: string;
  email?: string;
  emailVerified: boolean;
  /** `happyen` is a session this service issued itself, after its own OTP. */
  issuer: 'supabase' | 'happyen';
  phoneE164?: string;
  signInProvider?: string;
  subject: string;
  /**
   * Set when the token already names the account, which Happyen's own do —
   * their subject is the user id, so there is nothing to look up by issuer and
   * subject.
   */
  userId?: string;
}

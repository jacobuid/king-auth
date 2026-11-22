export interface VerifierSession {
  user: { id: string; name?: string; email?: string; emailVerified: boolean; username?: string; phoneNumber?: string; phoneNumberVerified?: boolean };
  session: { id: string; createdAt: string; expiresAt: string };
}
export interface VerifierRequest {
  headers: { get(name: string): string | null } | { authorization?: string };
}
export function createKingAuthVerifier(options: {origin: string;apiUrl?: string;verification?: 'central'|'access-pass';allowLocalhost?: boolean;fetch?: typeof globalThis.fetch}): {
  getSession(request: VerifierRequest): Promise<VerifierSession|null>;
  verifyAccessPass(request: VerifierRequest): Promise<VerifierSession|null>;
  isSignedIn(request: VerifierRequest): Promise<boolean>;
  verifyReauthentication(request: VerifierRequest,options: {proof: string;action: string}): Promise<boolean>;
};

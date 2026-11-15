export interface KingAuthUser { id: string; name?: string; email?: string; emailVerified: boolean }
export interface SignInTransaction { verifier: string; state: string; nonce: string; createdAt: number }
export interface KingAuthOptions { issuer?: string; clientId: string; clientSecret?: string; redirectUri: string; allowLocalhost?: boolean }
export function createKingAuth(options: KingAuthOptions): Promise<{
  begin(options?: { createAccount?: boolean }): Promise<{ url: string; transaction: SignInTransaction }>;
  complete(callbackURL: string | URL, transaction: SignInTransaction): Promise<KingAuthUser>;
}>;

export interface KingAuthUser { id: string; name?: string; email?: string; emailVerified: boolean }
export interface SignInTransaction { verifier: string; state: string; nonce: string; createdAt: number }
export interface KingAuthOptions { issuer?: string; clientId: string; clientSecret?: string; redirectUri: string; allowLocalhost?: boolean }
export function createKingAuth(options: KingAuthOptions): Promise<{
  begin(options?: { createAccount?: boolean }): Promise<{ url: string; transaction: SignInTransaction }>;
  complete(callbackURL: string | URL, transaction: SignInTransaction): Promise<KingAuthUser>;
}>;

import type { IncomingMessage, ServerResponse } from 'node:http';
export interface EmbeddedSession {
  user: KingAuthUser & { username?: string; phoneNumber?: string; phoneNumberVerified?: boolean };
  session: { id: string; createdAt: string; expiresAt: string };
}
export interface EmbeddedOptions {
  origin: string;
  secret: string;
  issuer?: string;
  basePath?: string;
  allowLocalhost?: boolean;
  fetch?: typeof globalThis.fetch;
}
export function createKingAuthProxy(options: EmbeddedOptions): {
  handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse, next?: () => void): Promise<void>;
  getSession(req: IncomingMessage, res?: ServerResponse): Promise<EmbeddedSession | null>;
  isSignedIn(req: IncomingMessage): Promise<boolean>;
};
export const createKingAuthServer: typeof createKingAuthProxy;

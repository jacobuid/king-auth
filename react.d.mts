import type { ReactNode, ReactElement, AnchorHTMLAttributes } from 'react';
import type { KingAuthUser } from './server.mjs';
export interface AuthProviderProps { children?: ReactNode; sessionURL?: string; signInURL?: string; signUpURL?: string; issuer?: string }
export interface AuthState { user: KingAuthUser | null; loading: boolean; error: Error | null; signInURL: string; signUpURL: string; issuer: string }
export function AuthProvider(props: AuthProviderProps): ReactElement;
export function useAuth(): AuthState;
export type AuthLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;
export function SignInButton(props: AuthLinkProps): ReactElement;
export const SignIn: typeof SignInButton;
export function SignUpButton(props: AuthLinkProps): ReactElement;
export const SignUp: typeof SignUpButton;
export function AccountSettings(props: AuthLinkProps): ReactElement;
export function ChangeEmail(props: AuthLinkProps): ReactElement;
export function ChangePhone(props: AuthLinkProps): ReactElement;
export function ChangeUsername(props: AuthLinkProps): ReactElement;
export function ChangePassword(props: AuthLinkProps): ReactElement;
export function ForgotPassword(props: AuthLinkProps): ReactElement;
export function ResetPassword(props: AuthLinkProps): ReactElement;

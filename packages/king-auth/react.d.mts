import type { ReactNode, ReactElement, CSSProperties, ButtonHTMLAttributes } from 'react';
import type { EmbeddedSession } from './server.mjs';
export interface AuthProviderProps { children?: ReactNode; basePath?: string }
export interface AuthState {
  user: EmbeddedSession['user'] | null;
  session: EmbeddedSession['session'] | null;
  isSignedIn: boolean;
  isLoading: boolean;
  loading: boolean;
  error: Error | null;
  refresh(): Promise<EmbeddedSession | null>;
  call(route: string, body?: Record<string, unknown>): Promise<unknown>;
  signOut(): Promise<unknown>;
}
export interface FormProps {
  className?: string;
  style?: CSSProperties;
  submitLabel?: string;
  onSuccess?(data?: unknown): void;
  onError?(error: Error): void;
}
export function AuthProvider(props: AuthProviderProps): ReactElement;
export function useAuth(): AuthState;
export const useSession: typeof useAuth;
export function SignIn(props?: FormProps): ReactElement;
export const SignInButton: typeof SignIn;
export function SignUp(props?: FormProps): ReactElement;
export const SignUpButton: typeof SignUp;
export function VerifyEmail(props?: FormProps & { email?: string }): ReactElement;
export function SendCode(props?: FormProps & { email?: string; purpose?: 'email-verification' | 'forget-password' }): ReactElement;
export function ForgotPassword(props?: FormProps): ReactElement;
export function ResetPassword(props?: FormProps & { identifier?: string }): ReactElement;
export function ChangeEmail(props?: FormProps): ReactElement;
export function ChangePhone(props?: FormProps): ReactElement;
export function ChangeUsername(props?: FormProps): ReactElement;
export function ChangePassword(props?: FormProps): ReactElement;
export function AccountSettings(props?: Pick<FormProps, 'className' | 'style'>): ReactElement;
export const Account: typeof AccountSettings;
export function SessionSettings(props?: FormProps): ReactElement;
export function Sessions(props?: Pick<FormProps, 'className' | 'style'>): ReactElement;
export function SignOut(props?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {onSuccess?(): void;onError?(error: Error): void}): ReactElement;
export function RequireAuth(props: {children?: ReactNode;fallback?: ReactNode}): ReactElement | ReactNode;

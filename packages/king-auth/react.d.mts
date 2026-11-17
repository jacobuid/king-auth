import type { ReactNode, ReactElement, CSSProperties, ButtonHTMLAttributes } from 'react';
export interface BrowserSession {
  user: {id: string;name?: string;email?: string;emailVerified: boolean};
  session: {id: string;createdAt: string;expiresAt: string};
}
type EmbeddedSession=BrowserSession;
export interface AccountSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string | null;
  current: boolean;
  appName: string;
  appOrigin: string | null;
  appPath: string | null;
  appType: 'PWA' | 'Browser' | null;
  device: 'Phone' | 'Tablet' | 'Computer' | 'Unknown device';
  deviceName: string;
  osName: string | null;
  browserName: string | null;
  browserVersion: string | null;
  ipAddress: string | null;
  userAgent?: string | null;
  location: {city: string;region: string;regionCode: string;country: string;countryCode: string;label: string} | null;
}
export interface AuthProviderProps { children?: ReactNode; mode?: 'browser'|'proxy'; apiUrl?: string; basePath?: string; appName?: string; appPath?: string }
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
  reauthenticate(action: string,password: string): Promise<ReauthenticationProof>;
  getToken(): string | null;
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
export interface ReauthenticationProof {proof: string;action: string;expiresAt: string}
export function Reauthenticate(props: Omit<FormProps,'onSuccess'> & {action: string;onSuccess?(result: ReauthenticationProof): void | Promise<void>}): ReactElement;
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
export interface AccountProps extends Pick<FormProps,'className'|'style'> {avatar?: ReactNode;gravatar?: boolean;avatarSize?: number;avatarClassName?: string}
export function AccountSettings(props?: AccountProps): ReactElement;
export const Account: typeof AccountSettings;
export function SessionSettings(props?: FormProps): ReactElement;
export function Sessions(props?: Pick<FormProps, 'className' | 'style'>): ReactElement;
export function SignOut(props?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {onSuccess?(): void;onError?(error: Error): void}): ReactElement;
export function RequireAuth(props: {children?: ReactNode;fallback?: ReactNode}): ReactElement | ReactNode;
export interface ProfileMenuProps {
  className?: string;
  style?: CSSProperties;
  triggerClassName?: string;
  menuClassName?: string;
  dialogClassName?: string;
  accountClassName?: string;
  avatar?: ReactNode;
  gravatar?: boolean;
  avatarSize?: number;
  avatarClassName?: string;
  triggerLabel?: string;
}
export function ProfileMenu(props?: ProfileMenuProps): ReactElement | null;
export function Avatar(props?: {email?: string;size?: number;gravatar?: boolean;alt?: string;className?: string;style?: CSSProperties}): ReactElement;
export function gravatarUrl(email?: string,size?: number): Promise<string|null>;
export function createBrowserClient(options?: {apiUrl?: string;appName?: string;appPath?: string;fetch?: typeof globalThis.fetch}): {
  request(route: string,body?: Record<string,unknown>): Promise<any>;
  getToken(): string | null;
  getSession(): Promise<EmbeddedSession | null>;
  isSignedIn(): Promise<boolean>;
  signOut(): Promise<unknown>;
};

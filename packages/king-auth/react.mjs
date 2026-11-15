import React, { createContext, useContext, useEffect, useState } from 'react';

const Context = createContext(null);
export function AuthProvider({ children, sessionURL = '/auth/session', signInURL = '/auth/login', issuer = 'https://kingauth.app' }) {
  const [state, setState] = useState({ user: null, loading: true, error: null });
  useEffect(() => { const abort = new AbortController(); fetch(sessionURL, { credentials: 'same-origin', signal: abort.signal }).then(async response => {
    if (!response.ok) throw Error('Unable to load session');
    const data = await response.json(); setState({ user: data.user || null, loading: false, error: null });
  }).catch(error => { if (error.name !== 'AbortError') setState({ user: null, loading: false, error }); }); return () => abort.abort(); }, [sessionURL]);
  return React.createElement(Context.Provider, { value: { ...state, signInURL, issuer } }, children);
}
export function useAuth() { const value = useContext(Context); if (!value) throw Error('Wrap components in AuthProvider'); return value; }
export function SignInButton({ children = 'Sign in with King Auth', ...props }) { const { signInURL } = useAuth(); return React.createElement('a', { ...props, href: signInURL }, children); }
export const SignIn = SignInButton;
function accountLink(section, fallback, { children, ...props }) { const { issuer } = useAuth(); const url = new URL('/account', issuer); if (section) url.searchParams.set('section', section); return React.createElement('a', { ...props, href: url.href }, children || fallback); }
export function AccountSettings(props) { return accountLink('', 'Manage your account', props); }
export function ChangeEmail(props) { return accountLink('email', 'Change email', props); }
export function ChangePhone(props) { return accountLink('phone', 'Change phone', props); }
export function ChangeUsername(props) { return accountLink('username', 'Change username', props); }
export function ChangePassword(props) { return accountLink('password', 'Change password', props); }
export function ForgotPassword({ children = 'Forgot password?', ...props }) { const { issuer } = useAuth(); return React.createElement('a', { ...props, href: new URL('/forgot-password', issuer).href }, children); }
export function ResetPassword({ children = 'Reset password', ...props }) { const { issuer } = useAuth(); return React.createElement('a', { ...props, href: new URL('/reset-password', issuer).href }, children); }

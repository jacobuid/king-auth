import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider,SignIn,SignUp,ForgotPassword,ProfileMenu,useAuth} from '@jacobuid/king-auth';
const h=React.createElement;
function App(){
  const {user,isSignedIn,isLoading,error}=useAuth();const [screen,setScreen]=React.useState('login');
  if(isLoading)return h('p',null,'Checking session...');
  return h('main',null,h('h1',null,'Browser-only website'),error?h('p',{role:'alert'},error.message):null,
    isSignedIn?h(React.Fragment,null,h(ProfileMenu),h('p',{'data-testid':'signed-in'},'Signed in as '+user.email)):
    h(React.Fragment,null,h('nav',null,...[['login','Sign in'],['signup','Create account'],['reset','Forgot password']].map(([key,label])=>h('button',{key,onClick:()=>setScreen(key)},label))),screen==='signup'?h(SignUp):screen==='reset'?h(ForgotPassword):h(SignIn)));
}
// Production uses the default HTTPS API. The global is only a local test override.
createRoot(document.getElementById('app')).render(h(AuthProvider,{apiUrl:globalThis.KING_AUTH_EXAMPLE_API||'https://kingauth.app/api/browser'},h(App)));

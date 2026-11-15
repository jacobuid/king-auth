import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider,SignIn,SignUp,ForgotPassword,Account,ProfileMenu,useAuth} from '@jacobuid/king-auth/react';
const h=React.createElement;
function App(){
  const {user,isSignedIn,isLoading,error}=useAuth();const [screen,setScreen]=React.useState('login');const [privateData,setPrivateData]=React.useState('');
  if(isLoading)return h('p',null,'Checking session...');
  return h('main',null,h('h1',null,'Your website'),error?h('p',{role:'alert'},error.message):null,
    isSignedIn?h(React.Fragment,null,h(ProfileMenu),h('p',{'data-testid':'signed-in'},'Signed in as '+user.email),h(Account),h('button',{onClick:async()=>{const res=await fetch('/api/private');setPrivateData(res.ok?JSON.stringify(await res.json()):'Access denied');}},'Check protected backend'),h('output',null,privateData)):
    h(React.Fragment,null,h('nav',null,...[['login','Sign in'],['signup','Create account'],['reset','Forgot password']].map(([key,label])=>h('button',{key,onClick:()=>setScreen(key)},label))),screen==='signup'?h(SignUp):screen==='reset'?h(ForgotPassword):h(SignIn)));
}
createRoot(document.getElementById('app')).render(h(AuthProvider,null,h(App)));

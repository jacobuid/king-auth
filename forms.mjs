import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import {createBrowserClient} from './browser.mjs';
import {PASSWORD_PATTERN,PASSWORD_MESSAGE} from './password-policy.mjs';
import {EYE_PATH,EYE_SLASH_PATH} from './password-toggle.mjs';
import {Avatar} from './avatar.mjs';
import {SessionDetails} from './session-view.mjs';

const h = React.createElement;
const Context = createContext(null);
export function AuthProvider({ children, mode='browser',apiUrl='https://kingauth.app/api/browser',basePath='/auth/api',appName,appPath }) {
  if(!['browser','proxy'].includes(mode))throw Error('Choose browser or proxy auth mode');
  if(!basePath.startsWith('/')||basePath.startsWith('//')||basePath.includes('?')||basePath.includes('#'))throw Error('Use a same-origin auth basePath');
  const browser=useMemo(()=>mode==='browser'?createBrowserClient({apiUrl,appName,appPath}):null,[mode,apiUrl,appName,appPath]);
  const [state,setState]=useState({user:null,session:null,isSignedIn:false,loading:true,error:null});
  const request=useCallback(async(route,body)=>{
    if(browser)return browser.request(route,body);
    const response=await fetch(basePath.replace(/\/$/,'')+'/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok){const error=new Error(data?.message||'Authentication request failed');error.code=data?.code;error.status=response.status;throw error;}
    return data;
  },[basePath,browser]);
  const refresh=useCallback(async()=>{try{const data=await request('get-session');setState({user:data?.user||null,session:data?.session||null,isSignedIn:!!data?.user,loading:false,error:null});return data;}catch(error){setState({user:null,session:null,isSignedIn:false,loading:false,error});throw error;}},[request]);
  useEffect(()=>{let active=true;const check=()=>{if(active)refresh().catch(()=>{});};check();window.addEventListener('focus',check);window.addEventListener('storage',check);return()=>{active=false;window.removeEventListener('focus',check);window.removeEventListener('storage',check);};},[refresh]);
  const call=useCallback(async(route,body)=>{const data=await request(route,body);if(body!==undefined&&!['reauthenticate','reauthentication/consume'].includes(route))await refresh();return data;},[request,refresh]);
  const reauthenticate=useCallback((action,password)=>request('reauthenticate',{action,password}),[request]);
  const signOut=useCallback(()=>call('sign-out',{}),[call]);
  return h(Context.Provider,{value:{...state,isLoading:state.loading,refresh,call,signOut,reauthenticate,getToken:()=>browser?.getToken()||null}},children);
}
export function useAuth(){const value=useContext(Context);if(!value)throw Error('Wrap King Auth components in AuthProvider');return value;}
export function useSession(){return useAuth();}
const emailField = initial => ({name:'email',label:'Email address',type:'email',autoComplete:'email',defaultValue:initial||''});
const passwordField = (name='password',label='Password',fresh=false) => ({name,label,type:'password',autoComplete:fresh?'new-password':'current-password',minLength:fresh?8:1,maxLength:128,...(fresh?{pattern:PASSWORD_PATTERN,title:PASSWORD_MESSAGE}: {})});
const otpField = (name='otp',label='Verification code')=>({name,label,inputMode:'numeric',pattern:'[0-9]{6}',autoComplete:'one-time-code',maxLength:6});
const phoneField = initial=>({name:'phoneNumber',label:'Phone number',type:'tel',placeholder:'+15551234567',pattern:'\\+[1-9][0-9]{7,14}',defaultValue:initial||''});
const rememberField={name:'rememberMe',label:'Stay signed in on this device for up to 3 years',type:'checkbox',required:false};
const confirmPassword=()=>passwordField('confirmPassword','Confirm new password',true);
function matched(data){if(data.newPassword!==data.confirmPassword)throw Error('New passwords must match.');return {currentPassword:data.currentPassword,newPassword:data.newPassword};}

function Form({title,fields,action,submitLabel='Continue',actions=[],onSuccess,onError,className,style}){
  const prefix=useId();const ref=useRef();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [failed,setFailed]=useState(false);
  const [revealed,setRevealed]=useState({});
  const values=()=>Object.fromEntries(new FormData(ref.current));
  const execute=async(work,primary)=>{setBusy(true);setMessage('');setFailed(false);try{const result=await work(values());setMessage(result?.message||'Done.');if(primary){ref.current?.querySelectorAll('input[data-king-auth-password],input[autocomplete="one-time-code"]').forEach(input=>{input.value='';});setRevealed({});await onSuccess?.(result?.data);}}catch(error){setFailed(true);setMessage(error.message||'Unable to complete request');onError?.(error);}finally{setBusy(false);}};
  return h('form',{ref,className:'king-auth-form '+(className||''),style,onSubmit:event=>{event.preventDefault();execute(action,true);}},
    h('h2',null,title),
    h('fieldset',{disabled:busy,className:'king-auth-fields'},
      ...fields.map(({name,label,type='text',required=true,options,...props})=>h('div',{key:name,className:'king-auth-field'},
        type==='honeypot'?h('div',{hidden:true,'aria-hidden':true},h('label',{htmlFor:prefix+name},label),h('input',{id:prefix+name,name,type:'text',tabIndex:-1,autoComplete:'off'})):type==='checkbox'?h('label',{htmlFor:prefix+name},h('input',{id:prefix+name,name,type,...props}),' '+label):h(React.Fragment,null,h('label',{htmlFor:prefix+name},label),type==='select'?h('select',{id:prefix+name,name,required,...props},options.map(([value,text])=>h('option',{key:value,value},text))):type==='password'?h('span',{className:'king-auth-password'},h('input',{id:prefix+name,name,type:revealed[name]?'text':'password',required,...props,'data-king-auth-password':''}),h('button',{type:'button',className:'king-auth-password-toggle','aria-controls':prefix+name,'aria-label':(revealed[name]?'Hide ':'Show ')+label.toLowerCase(),'aria-pressed':!!revealed[name],onClick:()=>setRevealed(value=>({...value,[name]:!value[name]}))},h('svg',{className:'king-auth-password-icon',width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2,'aria-hidden':true,focusable:'false'},h('path',{d:EYE_PATH}),h('circle',{cx:12,cy:12,r:3}),revealed[name]?h('path',{d:EYE_SLASH_PATH}):null))):h('input',{id:prefix+name,name,type,required,...props})))),
      h('button',{type:'submit'},busy?'Working...':submitLabel),
      ...actions.map(item=>h('button',{key:item.label,type:'button',onClick:()=>execute(item.action,false)},item.label))),
    h('p',{className:failed?'king-auth-error':'king-auth-status',role:failed?'alert':'status','aria-live':'polite'},message));
}
export function SignIn(props={}){
  const {call}=useAuth();const [needsCode,setNeedsCode]=useState(false);
  const send=async data=>({data:await call('sign-in-code/send',{email:data.email.trim()}),message:'If this account needs a sign-in code, one was sent. Wait one minute before requesting another.'});
  return h(Form,{title:'Sign in',submitLabel:'Sign in',...props,fields:[emailField(),passwordField(),...(needsCode?[otpField('loginCode','Code sent to your email')]:[]),rememberField],actions:needsCode?[{label:'Send sign-in code',action:send}]:[],action:async data=>{
    try{return {data:await call('sign-in/email',{email:data.email.trim(),password:data.password,rememberMe:data.rememberMe==='on',...(needsCode?{loginCode:data.loginCode}:{})}),message:'Signed in.'};}
    catch(error){if(error.code==='EMAIL_CODE_REQUIRED'){setNeedsCode(true);if(!needsCode)await send(data);}throw error;}
  }});
}
export const SignInButton=SignIn;
export function Reauthenticate({action,...props}={}){
  const {reauthenticate}=useAuth();
  if(!action)throw Error('Supply the protected action identifier');
  return h(Form,{title:'Confirm your password',submitLabel:'Confirm password',...props,fields:[passwordField()],action:async data=>({data:await reauthenticate(action,data.password),message:'Password confirmed.'})});
}
export function SignUp(props={}){
  const {call}=useAuth();const [email,setEmail]=useState(null);
  if(email)return h(VerifyEmail,{email,onSuccess:props.onSuccess,onError:props.onError,className:props.className,style:props.style});
  return h(Form,{title:'Create account',submitLabel:'Create account',...props,onSuccess:undefined,fields:[emailField(),passwordField('newPassword','Create password',true),confirmPassword(),rememberField,{name:'website',label:'Leave this field empty',type:'honeypot',required:false}],action:async data=>{matched(data);await call('sign-up/email',{email:data.email,name:data.email.split('@')[0],password:data.newPassword,rememberMe:data.rememberMe==='on',website:data.website||''});setEmail(data.email);return {message:'Check your email for a verification code.'};}});
}
export const SignUpButton=SignUp;
export function VerifyEmail({email,...props}={}){
  const {call}=useAuth();
  return h(Form,{title:'Verify email',submitLabel:'Verify email',...props,fields:[emailField(email),otpField()],action:async data=>{const result=await call('email-otp/verify-email',data);return {data:result,message:result?.user?.approvalStatus==='pending'?'Email verified. Your account is awaiting owner approval. You can sign in once approved.':'Email verified. You can now sign in.'};},actions:[{label:'Send code',action:async data=>{await call('email-otp/send-verification-otp',{email:data.email,type:'email-verification'});return {message:'If the address can be verified, a code is on its way.'};}}]});
}
export function SendCode({purpose='email-verification',email,...props}={}){
  const {call}=useAuth();if(!['email-verification','forget-password'].includes(purpose))throw Error('Unsupported code purpose');
  return h(Form,{title:purpose==='forget-password'?'Reset password':'Send verification code',submitLabel:'Send code',...props,fields:[emailField(email)],action:async data=>{const route=purpose==='forget-password'?'email-otp/request-password-reset':'email-otp/send-verification-otp';return {data:await call(route,purpose==='forget-password'?data:{...data,type:purpose}),message:'If the address matches an account, a code is on its way.'};}});
}
export function ForgotPassword(props={}){
  const {call}=useAuth();const [identifier,setIdentifier]=useState(null);
  if(identifier)return h(ResetPassword,{identifier,...props});
  return h(Form,{title:'Forgot password',submitLabel:'Send reset code',...props,onSuccess:undefined,fields:[emailField()],action:async data=>{await call('email-otp/request-password-reset',data);setIdentifier(data.email);return {message:'If an account matches, a reset code is on its way.'};}});
}
export function ResetPassword({identifier,...props}={}){
  const {call}=useAuth();return h(Form,{title:'Reset password',submitLabel:'Reset password',...props,fields:[emailField(identifier),otpField(),passwordField('newPassword','New password',true),confirmPassword()],action:async data=>{matched(data);return {data:await call('email-otp/reset-password',{email:data.email,otp:data.otp,password:data.newPassword}),message:'Password reset. You can now sign in.'};}});
}
export function ChangePassword(props={}){
  const {call}=useAuth();return h(Form,{title:'Change password',submitLabel:'Change password',...props,fields:[passwordField('currentPassword','Current password'),passwordField('newPassword','New password',true),confirmPassword()],action:async data=>({data:await call('change-password',matched(data)),message:'Password changed. Other King Auth sessions were signed out.'})});
}
export function ChangeUsername(props={}){
  const {call,user}=useAuth();return h(Form,{title:'Change username',submitLabel:'Save username',...props,fields:[{name:'username',label:'Username',defaultValue:user?.username||'',pattern:'[a-zA-Z][a-zA-Z0-9_]{2,29}',maxLength:30}],action:async data=>({data:await call('update-user',data),message:'Username changed. Your account ID is unchanged.'})});
}
export function ChangeEmail(props={}){
  const {call,user}=useAuth();const [next,setNext]=useState(null);
  if(next)return h(Form,{title:'Verify new email',submitLabel:'Save new email',...props,fields:[{name:'newEmail',label:'New email address',type:'email',defaultValue:next},otpField()],action:async data=>({data:await call('email-otp/change-email',data),message:'Email changed and verified.'})});
  return h(Form,{title:'Change email',submitLabel:'Verify current email',...props,onSuccess:undefined,fields:[{name:'newEmail',label:'New email address',type:'email'},otpField('otp','Code sent to current email')],actions:[{label:'Send current-email code',action:async()=>{if(!user)throw Error('Sign in first');await call('email-otp/send-verification-otp',{email:user.email,type:'email-verification'});return {message:'Code sent to your current email address.'};}}],action:async data=>{await call('email-otp/request-email-change',data);setNext(data.newEmail);return {message:'Check your new email for the next code.'};}});
}
export function ChangePhone(props={}){
  const {call}=useAuth();const [phone,setPhone]=useState(null);
  if(phone)return h(Form,{title:'Verify phone',submitLabel:'Save phone',...props,fields:[phoneField(phone),otpField('code')],action:async data=>({data:await call('phone-number/verify',{...data,updatePhoneNumber:true,disableSession:true}),message:'Phone number verified and saved.'})});
  return h(Form,{title:'Change phone',submitLabel:'Send verification code',...props,onSuccess:undefined,fields:[phoneField()],action:async data=>{await call('phone-number/send-otp',data);setPhone(data.phoneNumber);return {message:'Check your phone for the code.'};}});
}
export function SignOut({children='Sign out',onSuccess,onError,...props}={}){
  const {signOut}=useAuth();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return h(React.Fragment,null,h('button',{...props,type:'button',disabled:busy,onClick:async()=>{setBusy(true);setError('');try{await signOut();onSuccess?.();}catch(error){setError(error.message);onError?.(error);}finally{setBusy(false);}}},children),error?h('p',{role:'alert'},error):null);
}
export function RequireAuth({children,fallback=null}){const {isSignedIn,loading}=useAuth();return loading?null:isSignedIn?h(React.Fragment,null,children):fallback;}
export function SessionSettings(props={}){
  const {call,session}=useAuth();
  return h(React.Fragment,null,h('p',null,session?'This session expires '+new Date(session.expiresAt).toLocaleString():''),h(Form,{title:'Stay signed in',submitLabel:'Save session duration',...props,fields:[{name:'duration',label:'Session duration on this device',type:'select',defaultValue:'',options:[['','Choose a duration'],['0','Until browser closes (at most 1 day)'],['86400','1 day'],['604800','1 week'],['2592000','30 days'],['31536000','1 year'],['94608000','3 years']]}],action:async data=>({data:await call('account/session-duration',{seconds:Number(data.duration)||86400,persistent:data.duration!=='0'}),message:'Session duration saved. Browsers may clear cookies earlier. Sign in again to change this after 10 minutes.'})}));
}
export function Sessions({className,style}={}){
  const {call,session}=useAuth();const [items,setItems]=useState([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const reload=useCallback(async()=>setItems(await call('account/sessions')),[call]);
  useEffect(()=>{reload().catch(error=>setError(error.message));},[reload,session?.id]);
  const perform=async action=>{setBusy(true);setError('');try{await action();await reload();}catch(error){setError(error.message);}finally{setBusy(false);}};
  return h('section',{className,style},h('h2',null,'Signed-in sessions'),h('ul',null,items.map(item=>h(SessionDetails,{key:item.id,item,busy,onSignOut:()=>perform(()=>call('account/revoke-session',{sessionId:item.id}))}))),h('button',{type:'button',disabled:busy,onClick:()=>perform(()=>call('revoke-other-sessions',{}))},'Sign out other sessions'),error?h('p',{role:'alert'},error):null);
}
export function AccountSettings({className,style,avatar,gravatar=true,avatarSize=40,avatarClassName}={}){
  const {user,loading}=useAuth();if(loading)return h('p',null,'Checking session...');if(!user)return h(SignIn,{className,style});
  return h('section',{className,style},avatar??h(Avatar,{email:user.email,size:avatarSize,gravatar,className:avatarClassName}),h('p',null,user.email),h('p',null,'Account ID: ',user.id),h(ChangeEmail),h(ChangePassword),h(SessionSettings),h(Sessions),h(SignOut));
}
export const Account=AccountSettings;

/** Unstyled profile disclosure with keyboard menu navigation and a native modal. */
export function ProfileMenu({className,style,triggerClassName,menuClassName,dialogClassName,accountClassName,avatar,gravatar=true,avatarSize=40,avatarClassName,triggerLabel='Open profile menu'}={}){
  const {user,loading}=useAuth();const id=useId();
  const [open,setOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false);
  const root=useRef(),trigger=useRef(),menu=useRef(),dialog=useRef(),firstItem=useRef(0);
  useEffect(()=>{
    if(!open)return;
    const items=menu.current?.querySelectorAll('[role="menuitem"]:not(:disabled)');
    items?.[firstItem.current===-1?items.length-1:0]?.focus();
    const outside=event=>{if(!root.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);};
  },[open]);
  useEffect(()=>{
    const element=dialog.current;
    if(accountOpen&&user&&!element?.open)element?.showModal();
    else if(!accountOpen&&element?.open)element.close();
  },[accountOpen,user]);
  useEffect(()=>{if(!user){setOpen(false);setAccountOpen(false);}},[user]);
  if(loading||!user)return null;
  const closeMenu=()=>{setOpen(false);trigger.current?.focus();};
  const navigate=event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu();return;}
    if(event.key==='Tab'){setOpen(false);trigger.current?.focus();return;}
    const items=[...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const current=items.indexOf(document.activeElement);let next;
    if(event.key==='ArrowDown')next=(current+1)%items.length;
    else if(event.key==='ArrowUp')next=(current-1+items.length)%items.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=items.length-1;
    if(next!==undefined){event.preventDefault();items[next]?.focus();}
  };
  const picture=avatar??h(Avatar,{email:user.email,size:avatarSize,gravatar,className:avatarClassName});
  return h('div',{ref:root,className:['king-auth-profile',className].filter(Boolean).join(' '),style},
    h('button',{ref:trigger,id:id+'-trigger',type:'button',className:['king-auth-profile-trigger',triggerClassName].filter(Boolean).join(' '),'aria-label':triggerLabel,'aria-haspopup':'menu','aria-expanded':open,'aria-controls':open?id+'-menu':undefined,onClick:()=>{firstItem.current=0;setOpen(value=>!value);},onKeyDown:event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();firstItem.current=event.key==='ArrowUp'?-1:0;setOpen(true);}}},picture),
    open?h('div',{className:['king-auth-profile-dropdown',menuClassName].filter(Boolean).join(' ')},
      h('div',{className:'king-auth-profile-identity'},picture,user.name?h('p',null,user.name):null,h('p',null,user.email)),
      h('div',{ref:menu,id:id+'-menu',role:'menu','aria-labelledby':id+'-trigger',onKeyDown:navigate},
        h('button',{type:'button',role:'menuitem',tabIndex:-1,onClick:()=>{setOpen(false);setAccountOpen(true);}},'Manage account'),
        h(SignOut,{role:'menuitem',tabIndex:-1,onSuccess:()=>{setOpen(false);setAccountOpen(false);}}))):null,
    h('dialog',{ref:dialog,className:['king-auth-account-dialog',dialogClassName].filter(Boolean).join(' '),'aria-labelledby':id+'-title',onCancel:event=>{event.preventDefault();setAccountOpen(false);},onClose:()=>{setAccountOpen(false);trigger.current?.focus();}},
      h('h2',{id:id+'-title'},'Account'),
      h('button',{type:'button',className:'king-auth-account-close',autoFocus:true,'aria-label':'Close account',onClick:()=>setAccountOpen(false)},'Close'),
      accountOpen?h(Account,{className:accountClassName,avatar,gravatar,avatarSize,avatarClassName}):null));
}

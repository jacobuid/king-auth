import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';

const h = React.createElement;
const Context = createContext(null);
export function AuthProvider({ children, basePath='/auth/api' }) {
  if(!basePath.startsWith('/')||basePath.startsWith('//')||basePath.includes('?')||basePath.includes('#'))throw Error('Use a same-origin auth basePath');
  const [state,setState]=useState({user:null,session:null,isSignedIn:false,loading:true,error:null});
  const request=useCallback(async(route,body)=>{
    const response=await fetch(basePath.replace(/\/$/,'')+'/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok){const error=new Error(data?.message||'Authentication request failed');error.code=data?.code;error.status=response.status;throw error;}
    return data;
  },[basePath]);
  const refresh=useCallback(async()=>{try{const data=await request('get-session');setState({user:data?.user||null,session:data?.session||null,isSignedIn:!!data?.user,loading:false,error:null});return data;}catch(error){setState({user:null,session:null,isSignedIn:false,loading:false,error});throw error;}},[request]);
  useEffect(()=>{let active=true;const check=()=>{if(active)refresh().catch(()=>{});};check();window.addEventListener('focus',check);return()=>{active=false;window.removeEventListener('focus',check);};},[refresh]);
  const call=useCallback(async(route,body)=>{const data=await request(route,body);if(body!==undefined)await refresh();return data;},[request,refresh]);
  const signOut=useCallback(()=>call('sign-out',{}),[call]);
  return h(Context.Provider,{value:{...state,isLoading:state.loading,refresh,call,signOut}},children);
}
export function useAuth(){const value=useContext(Context);if(!value)throw Error('Wrap King Auth components in AuthProvider');return value;}
export function useSession(){return useAuth();}
const emailField = initial => ({name:'email',label:'Email address',type:'email',autoComplete:'email',defaultValue:initial||''});
const passwordField = (name='password',label='Password',fresh=false) => ({name,label,type:'password',autoComplete:fresh?'new-password':'current-password',minLength:fresh?12:1,maxLength:128});
const otpField = (name='otp',label='Verification code')=>({name,label,inputMode:'numeric',pattern:'[0-9]{6}',autoComplete:'one-time-code',maxLength:6});
const phoneField = initial=>({name:'phoneNumber',label:'Phone number',type:'tel',placeholder:'+15551234567',pattern:'\\+[1-9][0-9]{7,14}',defaultValue:initial||''});
const rememberField={name:'rememberMe',label:'Stay signed in on this device for up to 3 years',type:'checkbox',required:false};
const confirmPassword=()=>passwordField('confirmPassword','Confirm new password',true);
function matched(data){if(data.newPassword!==data.confirmPassword)throw Error('New passwords must match.');return {currentPassword:data.currentPassword,newPassword:data.newPassword};}

function Form({title,fields,action,submitLabel='Continue',actions=[],onSuccess,onError,className,style}){
  const prefix=useId();const ref=useRef();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [failed,setFailed]=useState(false);
  const values=()=>Object.fromEntries(new FormData(ref.current));
  const execute=async(work,primary)=>{setBusy(true);setMessage('');setFailed(false);try{const result=await work(values());setMessage(result?.message||'Done.');if(primary){ref.current?.querySelectorAll('input[type="password"],input[autocomplete="one-time-code"]').forEach(input=>{input.value='';});onSuccess?.(result?.data);}}catch(error){setFailed(true);setMessage(error.message||'Unable to complete request');onError?.(error);}finally{setBusy(false);}};
  return h('form',{ref,className:'king-auth-form '+(className||''),style,onSubmit:event=>{event.preventDefault();execute(action,true);}},
    h('h2',null,title),
    h('fieldset',{disabled:busy,className:'king-auth-fields'},
      ...fields.map(({name,label,type='text',required=true,options,...props})=>h('div',{key:name,className:'king-auth-field'},
        type==='checkbox'?h('label',{htmlFor:prefix+name},h('input',{id:prefix+name,name,type,...props}),' '+label):h(React.Fragment,null,h('label',{htmlFor:prefix+name},label),type==='select'?h('select',{id:prefix+name,name,required,...props},options.map(([value,text])=>h('option',{key:value,value},text))):h('input',{id:prefix+name,name,type,required,...props})))),
      h('button',{type:'submit'},busy?'Working...':submitLabel),
      ...actions.map(item=>h('button',{key:item.label,type:'button',onClick:()=>execute(item.action,false)},item.label))),
    h('p',{className:failed?'king-auth-error':'king-auth-status',role:failed?'alert':'status','aria-live':'polite'},message));
}
export function SignIn(props={}){
  const {call}=useAuth();
  return h(Form,{title:'Sign in',submitLabel:'Sign in',...props,fields:[emailField(),passwordField(),rememberField],action:async data=>{
    return {data:await call('sign-in/email',{email:data.email.trim(),password:data.password,rememberMe:data.rememberMe==='on'}),message:'Signed in.'};
  }});
}
export const SignInButton=SignIn;
export function SignUp(props={}){
  const {call}=useAuth();const [email,setEmail]=useState(null);
  if(email)return h(VerifyEmail,{email,onSuccess:props.onSuccess,onError:props.onError,className:props.className,style:props.style});
  return h(Form,{title:'Create account',submitLabel:'Create account',...props,onSuccess:undefined,fields:[emailField(),passwordField('newPassword','Create password',true),confirmPassword(),rememberField],action:async data=>{matched(data);await call('sign-up/email',{email:data.email,name:data.email.split('@')[0],password:data.newPassword,rememberMe:data.rememberMe==='on'});setEmail(data.email);return {message:'Check your email for a verification code.'};}});
}
export const SignUpButton=SignUp;
export function VerifyEmail({email,...props}={}){
  const {call}=useAuth();
  return h(Form,{title:'Verify email',submitLabel:'Verify email',...props,fields:[emailField(email),otpField()],action:async data=>({data:await call('email-otp/verify-email',data),message:'Email verified.'}),actions:[{label:'Send code',action:async data=>{await call('email-otp/send-verification-otp',{email:data.email,type:'email-verification'});return {message:'If the address can be verified, a code is on its way.'};}}]});
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
  return h('section',{className,style},h('h2',null,'Signed-in sessions'),h('ul',null,items.map(item=>h('li',{key:item.id},item.current?'This session':item.userAgent||'Another session',' - expires '+new Date(item.expiresAt).toLocaleString(),' ',h('button',{type:'button',disabled:busy,onClick:()=>perform(()=>call('account/revoke-session',{sessionId:item.id}))},'Sign out')))),h('button',{type:'button',disabled:busy,onClick:()=>perform(()=>call('revoke-other-sessions',{}))},'Sign out other sessions'),error?h('p',{role:'alert'},error):null);
}
export function AccountSettings({className,style}={}){
  const {user,loading}=useAuth();if(loading)return h('p',null,'Checking session...');if(!user)return h(SignIn,{className,style});
  return h('section',{className,style},h('p',null,user.email),h('p',null,'Account ID: ',user.id),h(ChangeEmail),h(ChangePassword),h(SessionSettings),h(Sessions),h(SignOut));
}
export const Account=AccountSettings;

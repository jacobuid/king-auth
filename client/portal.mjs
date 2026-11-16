import { createAuthClient } from 'better-auth/client';
import { usernameClient, emailOTPClient, phoneNumberClient } from 'better-auth/client/plugins';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import {PASSWORD_PATTERN,PASSWORD_MESSAGE} from '../packages/king-auth/password-policy.mjs';
import {mountPasswordToggles} from '../packages/king-auth/password-toggle.mjs';

const auth = createAuthClient({ plugins: [usernameClient(), emailOTPClient(), phoneNumberClient(), oauthProviderClient()] });
const root = document.querySelector('#app');
const query = new URLSearchParams(location.search);
const path = location.pathname;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const link = route => route + (location.search || '');
const input = (name, label, type = 'text', placeholder = '', extra = '') => `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" placeholder="${placeholder}" ${extra} required></div>`;
const code = (name = 'otp', label = 'Verification code') => input(name, label, 'text', '6-digit code', 'inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code"');
const password = (name = 'password', label = 'Password', fresh = false) => input(name, label, 'password', fresh ? 'At least 8 characters' : 'Enter your password', `autocomplete="${fresh ? 'new-password' : 'current-password'}" minlength="${fresh ? 8 : 1}" maxlength="128" ${fresh?`pattern="${escape(PASSWORD_PATTERN)}" title="${escape(PASSWORD_MESSAGE)}"`:''}`);
const submit = text => `<button class="wide" type="submit">${text} <span aria-hidden="true"></span></button>`;
const notice = '<div class="status hidden" role="status"></div>';
const config = await fetch('/api/config').then(r => r.json());
const tabs = `<div class="tabs"><a class="${path === '/sign-in' ? 'active' : ''}" href="${link('/sign-in')}">Sign in</a><a class="${path === '/sign-up' ? 'active' : ''}" href="${link('/sign-up')}">Create account</a></div>`;
function layout(content) {
  root.innerHTML = `<div class="service-auth"><section class="card">${content}</section></div>`;
}
function status(text, error = false, parent = document) {
  const el = parent.querySelector('[role="status"]') || document.querySelector('#status');
  if (el) { el.textContent = text; el.className = `status${error ? ' error' : ''}`; }
}
function form(id, action) {
  document.getElementById(id)?.addEventListener('submit', async event => {
    event.preventDefault(); const el = event.currentTarget; const button = el.querySelector('button[type="submit"]');
    button.disabled = true;
    try { await action(Object.fromEntries(new FormData(el)), el); }
    catch (error) { status(error.message || 'Something went wrong. Please try again.', true, el); }
    finally { button.disabled = false; }
  });
}
async function call(promise) { const result = await promise; if (result.error) {const error=new Error(result.error.message || 'Request failed.');error.code=result.error.code;throw error;} return result.data; }
async function sendLoginCode(email){const response=await fetch('/api/auth/sign-in-code/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});if(!response.ok)throw Error('Unable to send a sign-in code. Please try again later.');}
function navigate(data, fallback = '/account') { if (data?.redirect && data.url) location.assign(data.url); else location.assign(fallback); }
async function signIn(data) {
  const identifier = data.identifier.trim();
  const body = { password: data.password, callbackURL: '/account',loginCode:data.loginCode };
  try{const result=await call(auth.signIn.email({...body,email:identifier}));navigate(result);}
  catch(error){if(error.code==='EMAIL_CODE_REQUIRED'){const field=document.querySelector('#login-code');if(field.hidden){field.hidden=false;field.querySelector('input').required=true;await sendLoginCode(identifier);}}throw error;}
}
if (path === '/sign-in') {
  layout(`${tabs}<h2>Sign in</h2><p class="subtext">Sign in to your King Auth account.</p><form id="signin">${input('identifier','Email address','email','you@example.com','autocomplete="username"')}${password()}<a class="small-link" href="${link('/forgot-password')}">Forgot your password?</a>${notice}<br>${submit('Sign in')}</form><a class="small-link" href="${link('/verify-email')}">Verify your email</a>`);
  form('signin', signIn);
  const extra=document.createElement('div');extra.id='login-code';extra.hidden=true;extra.innerHTML=`${code('loginCode','Code sent to your email')}<button type="button" id="send-login-code">Send sign-in code</button>`;document.querySelector('#signin button[type=submit]').before(extra);
  document.querySelector('#send-login-code').onclick=async()=>{try{await sendLoginCode(document.querySelector('#identifier').value);status('If needed, a code was sent. Wait one minute before requesting another.');}catch(error){status(error.message,true);}};
} else if (path === '/sign-up') {
  layout(`${tabs}<h2>Create account</h2><p class="subtext">Create one account for every connected site.</p>${!config.emailEnabled ? '<div class="status">Account registration will be available once email delivery is configured.</div>' : ''}<form id="signup">${input('email','Email address','email','you@example.com','autocomplete="email"')}${password('password','Create a password',true)}<div hidden aria-hidden="true"><label>Leave this field empty<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>${notice}${submit('Create account')}</form><p class="form-note">We'll send a code to verify your email.<br>Your account works across all King Auth connected sites.</p>`);
  if (!config.emailEnabled) document.querySelector('button[type=submit]').disabled = true;
  form('signup', async data => { await call(auth.signUp.email({...data,name:data.email.split('@')[0]})); query.set('email',data.email); location.assign('/verify-email?' + query); });
} else if (path === '/verify-email') {
  layout(`<h2>Check your inbox.</h2><p class="subtext">Enter the code sent to your email to verify your account.</p><form id="verify">${input('email','Email address','email','you@example.com',`autocomplete="email" value="${escape(query.get('email'))}"`)}${code()}${notice}${submit('Verify email')}</form><button class="secondary wide" id="resend">Send a new code</button>`);
  document.querySelector('#resend').addEventListener('click', async event => { event.target.disabled = true; try { await call(auth.emailOtp.sendVerificationOtp({ email: document.querySelector('#email').value,type:'email-verification' })); status('If this address can be verified, a code is on its way.'); } catch(error){status(error.message,true);} finally{event.target.disabled=false;} });
  form('verify', async data => { const result = await call(auth.emailOtp.verifyEmail(data)); if(result?.user?.approvalStatus==='pending'){status('Email verified. Your account is awaiting owner approval.');return;} if (query.has('sig')) { const continued = await call(auth.oauth2.continue({ postLogin:true })); navigate(continued); } else navigate(result); });
} else if (path === '/forgot-password') {
  layout(`<h2>Reset password</h2><p class="subtext">We'll send a reset code to your verified email or phone.</p><form id="forgot">${input('identifier','Email address or phone','text','you@example.com')}${notice}${submit('Send reset code')}</form><a class="small-link" href="${link('/sign-in')}">Back to sign in</a>`);
  form('forgot', async (data,el) => { const phone = data.identifier.startsWith('+'); if(phone) await call(auth.phoneNumber.requestPasswordReset({phoneNumber:data.identifier})); else await call(auth.emailOtp.requestPasswordReset({email:data.identifier})); status('If an account matches, a reset code is on its way.',false,el); query.set('identifier',data.identifier); location.assign('/reset-password?'+query); });
} else if (path === '/reset-password') {
  layout(`<h2>Set a new password</h2><p class="subtext">Enter your reset code and choose a new password.</p><form id="reset">${input('identifier','Email address or phone','text','you@example.com',`value="${escape(query.get('identifier'))}"`)}${code()}${password('password','New password',true)}${notice}${submit('Reset password')}</form><a class="small-link" href="${link('/forgot-password')}">Request another code</a>`);
  form('reset', async (data,el) => { if(data.identifier.startsWith('+')) await call(auth.phoneNumber.resetPassword({phoneNumber:data.identifier,otp:data.otp,newPassword:data.password})); else await call(auth.emailOtp.resetPassword({email:data.identifier,otp:data.otp,password:data.password})); status('Password reset. You can now sign in.',false,el); setTimeout(()=>location.assign(link('/sign-in')),1500); });
} else if (path === '/consent') {
  const response = await fetch('/api/consent-details'+location.search); const details = await response.json();
  if (!response.ok) layout(`<h2>Start sign-in again.</h2><p class="subtext">${escape(details.message)}</p><a class="button wide" href="/">Back to King Auth</a>`);
  else {
    layout(`<span class="pill">Permission request</span><br><br><h2>Connect to ${escape(details.name || details.host)}?</h2><p class="subtext">You're signing in to <strong>${escape(details.host)}</strong>. This site is requesting:</p><ul class="consent-scopes">${String(details.scopes).split(' ').map(scope=>`<li>${escape(({openid:'Your permanent account ID',profile:'Your name and profile',email:'Your email address and verification status',offline_access:'Access until you revoke the connection'})[scope] || scope)}</li>`).join('')}</ul><p class="subtext">Your password is never shared with this website.</p>${notice}<div class="stack"><button id="allow">Allow and continue </button><button class="secondary" id="deny">Cancel</button></div>`);
    for(const [id,accept] of [['allow',true],['deny',false]]) document.getElementById(id).addEventListener('click',async event=>{event.target.disabled=true;try{navigate(await call(auth.oauth2.consent({accept})));}catch(error){status(error.message,true);event.target.disabled=false;}});
  }
} else if (path === '/account') {
  const session = await call(auth.getSession());
  if (!session) location.replace('/sign-in');
  else await account(session);
} else if (path === '/developers') {
  await developers();
}

async function account({user}) {
  root.innerHTML = `<div class="account-layout"><div class="section-head"><div class="eyebrow">Your King Auth account</div><h1>Account settings</h1><p class="intro">Changes here follow you across your connected sites.</p></div><div class="identity"><span class="avatar">${escape(user.name?.slice(0,1).toUpperCase())}</span><div><strong>${escape(user.name)}</strong><p>${escape(user.email)}</p><code>${escape(user.id)}</code></div></div><div class="account-grid">
  <section class="card" id="username"><h2>Username</h2><p class="subtext">Your permanent ID stays the same.</p><form id="username-form">${input('username','Username','text','Your username',`value="${escape(user.username)}" pattern="[a-zA-Z][a-zA-Z0-9_]{2,29}"`)}${notice}${submit('Save username')}</form></section>
  <section class="card" id="password"><h2>Password</h2><p class="subtext">Updating your password signs out other King Auth sessions.</p><form id="password-form">${password('currentPassword','Current password')}${password('newPassword','New password',true)}${notice}${submit('Update password')}</form></section>
  <section class="card" id="email"><h2>Email address</h2><p class="subtext">Confirm both your current and new email addresses.</p><button class="secondary" id="current-code">Send code to current email</button><br><br><form id="email-request">${input('newEmail','New email address','email','you@example.com')}${code('otp','Code sent to current email')}${notice}${submit('Verify current email')}</form><form id="email-confirm" class="hidden"><input name="newEmail" type="hidden">${code('otp','Code sent to new email')}${notice}${submit('Save new email')}</form></section>
  <section class="card" id="phone"><h2>Phone number</h2><p class="subtext">${config.smsEnabled ? `Current: ${escape(user.phoneNumber || 'Not added')}. Use international format, such as +15551234567.` : 'Phone verification becomes available when SMS delivery is configured.'}</p><form id="phone-request">${input('phoneNumber','Phone number','tel','+15551234567','pattern="\\+[1-9][0-9]{7,14}"')}${notice}${submit('Send verification code')}</form><form id="phone-confirm" class="hidden"><input name="phoneNumber" type="hidden">${code()}${notice}${submit('Verify phone')}</form></section>
  <section class="card"><h2>Signed-in devices</h2><p class="subtext">Review and end King Auth sessions.</p><div id="sessions"></div>${notice}<button id="logout" class="secondary wide">Sign out of King Auth</button></section>
  <section class="card"><h2>Connected websites</h2><p class="subtext">Revoke a website's authorization. Its own session may remain active until it expires.</p><div id="connections"></div><div class="status hidden" role="status"></div></section></div></div>`;
  form('username-form', async(data,el)=>{await call(auth.updateUser(data));status('Username updated. Your account ID is unchanged.',false,el);});
  form('password-form', async(data,el)=>{await call(auth.changePassword({...data,revokeOtherSessions:true}));el.reset();status('Password updated.',false,el);});
  document.querySelector('#current-code').addEventListener('click',async()=>{try{await call(auth.emailOtp.sendVerificationOtp({email:user.email,type:'email-verification'}));status('Code sent to your current email.',false,document.querySelector('#email-request'));}catch(e){status(e.message,true,document.querySelector('#email-request'));}});
  form('email-request',async(data,el)=>{await call(auth.emailOtp.requestEmailChange(data));document.querySelector('#email-confirm [name=newEmail]').value=data.newEmail;el.classList.add('hidden');document.querySelector('#email-confirm').classList.remove('hidden');});
  form('email-confirm',async(data,el)=>{await call(auth.emailOtp.changeEmail(data));status('Your email address has been updated.',false,el);});
  if(!config.smsEnabled) document.querySelector('#phone-request button').disabled=true;
  form('phone-request',async(data,el)=>{await call(auth.phoneNumber.sendOtp(data));document.querySelector('#phone-confirm [name=phoneNumber]').value=data.phoneNumber;el.classList.add('hidden');document.querySelector('#phone-confirm').classList.remove('hidden');});
  form('phone-confirm',async(data,el)=>{await call(auth.phoneNumber.verify({...data,updatePhoneNumber:true,disableSession:true}));status('Phone number verified and saved.',false,el);});
  document.querySelector('#logout').addEventListener('click',async()=>{await call(auth.signOut());location.assign('/sign-in');});
  const sessions = await call(auth.listSessions());
  const container = document.querySelector('#sessions');
  for(const session of sessions || []) {const row=document.createElement('div');row.className='session-row';row.innerHTML=`<span>${escape(session.userAgent?.slice(0,65) || 'Browser session')}<br>${escape(new Date(session.createdAt).toLocaleDateString())}</span><button class="secondary">Sign out</button>`;row.querySelector('button').onclick=async()=>{try{await call(auth.revokeSession({token:session.token}));row.remove();}catch(e){status(e.message,true,row.parentElement.parentElement);}};container.append(row);}
  try { const consents=await call(auth.oauth2.getConsents());for(const consent of consents || []){const row=document.createElement('div');row.className='session-row';row.innerHTML=`<span>${escape(consent.clientId)}</span><button class="secondary">Revoke</button>`;row.querySelector('button').onclick=async()=>{try{await call(auth.oauth2.deleteConsent({id:consent.id}));row.remove();}catch(e){status(e.message,true,row.parentElement.parentElement);}};document.querySelector('#connections').append(row);}if(!consents?.length)document.querySelector('#connections').textContent='No connected websites yet.';}catch{document.querySelector('#connections').textContent='Connections are unavailable. Please refresh.';}
  const section=query.get('section');if(['username','email','phone','password'].includes(section))document.getElementById(section).scrollIntoView({behavior:'smooth'});
}

async function developers() {
  const {admin} = await fetch('/api/admin/status').then(r=>r.json());
  if (!admin) { root.textContent = 'Not found'; return; }
  root.innerHTML = `<div class="service-auth"><section class="card"><h2>Register website</h2><form id="client-create">${input('client_name','Website name','text','My website')}${input('redirect','Exact HTTPS callback URL','url','https://example.com/auth/callback')}<div class="field"><label for="kind">Client type</label><select id="kind" name="kind"><option value="client_secret_basic">Server application</option><option value="none">Public browser application</option></select></div>${notice}${submit('Register website')}</form><pre id="credentials" class="hidden"></pre></section></div>`;
  form('client-create',async(data,el)=>{const uri=new URL(data.redirect);if(uri.protocol!=='https:')throw Error('Use an HTTPS callback URL.');const result=await call(auth.oauth2.createClient({client_name:data.client_name,redirect_uris:[uri.href],scope:'openid profile email',token_endpoint_auth_method:data.kind}));const output=document.querySelector('#credentials');output.textContent=JSON.stringify(result,null,2);output.classList.remove('hidden');status('Website registered. Store the client secret securely now; it is only shown once.',false,el);});
}
mountPasswordToggles(root);

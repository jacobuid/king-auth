// Shared public operations. Owner/admin/OAuth endpoints are deliberately absent.
export const AUTH_ROUTES=new Map([
  ['get-session',['GET',[]]],['sign-out',['POST',[]]],
  ['sign-in/email',['POST',['email','password','rememberMe','loginCode']]],
  ['sign-in/username',['POST',['username','password','rememberMe','loginCode']]],
  ['sign-in/phone-number',['POST',['phoneNumber','password','rememberMe','loginCode']]],
  ['sign-in-code/send',['POST',['email']]],
  ['sign-up/email',['POST',['name','email','username','password','rememberMe','website']]],
  ['email-otp/send-verification-otp',['POST',['email','type']]],
  ['email-otp/verify-email',['POST',['email','otp']]],
  ['email-otp/request-password-reset',['POST',['email']]],
  ['email-otp/reset-password',['POST',['email','otp','password']]],
  ['email-otp/request-email-change',['POST',['newEmail','otp']]],
  ['email-otp/change-email',['POST',['newEmail','otp']]],
  ['phone-number/send-otp',['POST',['phoneNumber']]],
  ['phone-number/verify',['POST',['phoneNumber','code','updatePhoneNumber','disableSession']]],
  ['phone-number/request-password-reset',['POST',['phoneNumber']]],
  ['phone-number/reset-password',['POST',['phoneNumber','otp','newPassword']]],
  ['update-user',['POST',['username','name']]],
  ['change-password',['POST',['currentPassword','newPassword','revokeOtherSessions']]],
  ['account/session-duration',['POST',['seconds','persistent']]],
  ['account/sessions',['GET',[]]],['account/revoke-session',['POST',['sessionId']]],
  ['revoke-other-sessions',['POST',[]]],
]);

export function publicData(value){
  if(Array.isArray(value))return value.map(publicData);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['token','access_token','refresh_token','id_token','password','secret'].includes(key)).map(([key,item])=>[key,publicData(item)]));
}

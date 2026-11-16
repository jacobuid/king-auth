export const PASSWORD_MIN_LENGTH=8;
export const PASSWORD_MAX_LENGTH=128;
export const PASSWORD_MESSAGE='Use 8–128 characters, including an uppercase letter, a lowercase letter, a number, and a special character.';
export const PASSWORD_PATTERN='(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[\\p{P}\\p{S}]).{8,128}';
const pattern=new RegExp('^(?:'+PASSWORD_PATTERN+')$','u');
export function validNewPassword(value){return typeof value==='string'&&value.length<=PASSWORD_MAX_LENGTH&&pattern.test(value);}

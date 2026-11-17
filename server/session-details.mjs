import {deviceInfo} from '../packages/king-auth/device-info.mjs';

/** Display hints only; session ownership and authorization use the stored IDs. */
export function sessionDetails(session){
  let appOrigin=null,appName='Unknown app',appPath=null;
  if(session.browserOrigin){
    try{
      const url=new URL(session.browserOrigin);
      if(['https:','http:'].includes(url.protocol)){
        appOrigin=url.origin;
        const host=url.hostname.replace(/^www\./,'');
        appName=host==='kingauth.app'?'King Auth':host.split('.')[0].split(/[-_]+/).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
        appPath=session.browserAppPath||null;
        const project=appPath?.split('/').filter(Boolean)[0];
        if(project)appName=decodeURIComponent(project).split(/[-_]+/).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
        if(session.browserAppName)appName=session.browserAppName;
      }
    }catch{}
  }
  let hints={};
  try{hints=JSON.parse(session.browserDeviceHints)||{};}catch{}
  const appType=session.browserDisplayMode==='standalone'?'PWA':session.browserDisplayMode==='browser'?'Browser':null;
  return {appName,appOrigin,appPath,...deviceInfo(session.userAgent,hints),appType};
}

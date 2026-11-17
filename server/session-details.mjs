/** Display hints only; session ownership and authorization use the stored IDs. */
export function sessionDetails(session){
  let appOrigin=null,appName='Unknown app';
  if(session.browserOrigin){
    try{
      const url=new URL(session.browserOrigin);
      if(['https:','http:'].includes(url.protocol)){
        appOrigin=url.origin;
        const host=url.hostname.replace(/^www\./,'');
        appName=host==='kingauth.app'?'King Auth':host.split('.')[0].split(/[-_]+/).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
      }
    }catch{}
  }
  const ua=session.userAgent||'';
  const device=/iPad|Tablet|Kindle|Silk/i.test(ua)||(/Android/i.test(ua)&&!/Mobile/i.test(ua))?'Tablet'
    :/Mobi|iPhone|iPod|Windows Phone/i.test(ua)?'Phone'
    :/Windows NT|Macintosh|X11|CrOS|Linux/i.test(ua)?'Computer':'Unknown device';
  return {appName,appOrigin,device};
}

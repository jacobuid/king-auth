/** App labels are display metadata, never an authorization boundary. */
export function normalizeAppInfo(origin,value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Use app metadata with a same-origin path');
  const {path='/',name,displayMode,deviceHints}=value;
  if(typeof path!=='string'||path.length>255||!path.startsWith('/')||path.startsWith('//')||/[\\?#\u0000-\u0020\u007f]/.test(path))throw Error('Use an app path without a query or fragment');
  const url=new URL(path,origin);
  if(url.origin!==origin)throw Error('Use a same-origin app path');
  if(name!==undefined&&(typeof name!=='string'||!name.trim()||name.length>80||/[\u0000-\u001f\u007f]/.test(name)))throw Error('Use an app name of 1–80 characters');
  if(displayMode!==undefined&&!['standalone','browser'].includes(displayMode))throw Error('Use a supported app display mode');
  let hints;
  if(deviceHints!==undefined){
    if(!deviceHints||typeof deviceHints!=='object'||Array.isArray(deviceHints))throw Error('Use valid device hints');
    hints={};
    for(const key of ['multiTouch','mobile'])if(deviceHints[key]!==undefined){
      if(typeof deviceHints[key]!=='boolean')throw Error('Use boolean device hints');
      hints[key]=deviceHints[key];
    }
    if(deviceHints.platform!==undefined){
      if(!['Android','Chrome OS','iOS','Linux','macOS','Windows'].includes(deviceHints.platform))throw Error('Use a supported platform hint');
      hints.platform=deviceHints.platform;
    }
  }
  return {path:url.pathname,...(name===undefined?{}:{name:name.trim()}),...(displayMode===undefined?{}:{displayMode}),...(hints?{deviceHints:hints}:{})};
}

export function browserAppInfo({appName,appPath,location=globalThis.location,navigator=globalThis.navigator,matchMedia=globalThis.matchMedia?.bind(globalThis)}={}){
  if(!location?.origin)return null;
  // GitHub Pages project sites share an origin; retain only the repository path,
  // never a deep link, query, or hash which could contain private information.
  const url=new URL(location.href||location.origin);
  const project=url.hostname.endsWith('.github.io')?url.pathname.split('/').filter(Boolean)[0]:null;
  const standalone=navigator?.standalone===true||['standalone','minimal-ui','window-controls-overlay'].some(mode=>matchMedia?.('(display-mode: '+mode+')')?.matches);
  const deviceHints={multiTouch:Number(navigator?.maxTouchPoints)>1};
  const uaData=navigator?.userAgentData;
  if(typeof uaData?.mobile==='boolean')deviceHints.mobile=uaData.mobile;
  if(['Android','Chrome OS','iOS','Linux','macOS','Windows'].includes(uaData?.platform))deviceHints.platform=uaData.platform;
  return normalizeAppInfo(url.origin,{path:appPath??(project?'/'+project+'/':'/'),name:appName,displayMode:standalone?'standalone':'browser',deviceHints});
}

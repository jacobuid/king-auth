import React,{useEffect,useState} from 'react';

/** Gravatar expects SHA-256 of the trimmed, lowercase email. No API key needed. */
export async function gravatarUrl(email,size=80){
  const normalized=String(email||'').trim().toLowerCase();if(!normalized)return null;
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
  const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  return 'https://www.gravatar.com/avatar/'+hash+'?s='+Math.min(2048,Math.max(16,Math.round(Number(size)||80)))+'&d=404&r=g';
}

export function Avatar({email,size=40,gravatar=true,alt='',className,style}={}){
  const normalized=String(email||'').trim().toLowerCase();const pixels=Math.min(2048,Math.max(16,Math.round(Number(size)||40)));
  const [image,setImage]=useState(null),[failed,setFailed]=useState(null);
  useEffect(()=>{
    let active=true;
    if(gravatar&&normalized)gravatarUrl(normalized,pixels).then(url=>{if(active)setImage({email:normalized,size:pixels,url});}).catch(()=>{});
    return()=>{active=false;};
  },[normalized,pixels,gravatar]);
  const props={className:['king-auth-avatar',className].filter(Boolean).join(' '),style,width:pixels,height:pixels};
  const url=gravatar&&image?.email===normalized&&image.size===pixels&&image.url!==failed?image.url:null;
  if(url)return React.createElement('img',{...props,src:url,alt,referrerPolicy:'no-referrer',decoding:'async',onError:()=>setFailed(url)});
  return React.createElement('svg',{...props,viewBox:'0 0 128 128',role:alt?'img':undefined,'aria-label':alt||undefined,'aria-hidden':alt?undefined:true,focusable:'false','data-avatar-fallback':''},
    React.createElement('rect',{width:128,height:128,fill:'#e5e7eb'}),
    React.createElement('circle',{cx:64,cy:53,r:26,fill:'#b1b5b6'}),
    React.createElement('path',{d:'M14 116c3-24 25-35 50-35s47 11 50 35Z',fill:'#b1b5b6'}));
}

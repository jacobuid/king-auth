import React from 'react';

const h=React.createElement;
function deviceIcon(device){
  const shape=device==='Phone'?[h('rect',{key:'body',x:7,y:2,width:10,height:20,rx:2}),h('path',{key:'detail',d:'M11 18h2'})]
    :device==='Tablet'?[h('rect',{key:'body',x:4,y:2,width:16,height:20,rx:2}),h('path',{key:'detail',d:'M11 18h2'})]
    :[h('rect',{key:'body',x:2,y:3,width:20,height:14,rx:1}),h('path',{key:'detail',d:'M8 21h8m-4-4v4'})];
  return h('svg',{className:'king-auth-session-icon',width:24,height:24,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},...shape);
}
function timestamp(value){
  const date=new Date(value);
  return value&&!Number.isNaN(date.getTime())?h('time',{dateTime:date.toISOString()},date.toLocaleString()):null;
}

/** Account-owner session details; never pass authentication credentials into this view. */
export function SessionDetails({item,busy,onSignOut}){
  const browser=[item.browserName,item.browserVersion].filter(Boolean).join(' ')||'Browser unavailable';
  const location=item.location?([item.location.city,item.location.regionCode||item.location.region,item.location.country||item.location.countryCode].filter(Boolean).join(', ')||item.location.label):null;
  const address=item.appOrigin?new URL(item.appOrigin).host+(item.appPath&&item.appPath!=='/'?item.appPath:''):null;
  return h('li',{className:'king-auth-session'},
    h('div',{className:'king-auth-session-heading'},deviceIcon(item.device),' ',h('strong',null,item.appName||'Unknown app'),' - ',item.deviceName||item.device||'Unknown device',item.current?h('span',{className:'king-auth-session-current'},' (This device)'):null),
    address?h('p',{className:'king-auth-session-app',title:item.appOrigin+(item.appPath||'')},address):null,
    h('p',{className:'king-auth-session-browser'},browser,item.appType?' - '+item.appType:'',item.osName?' - '+item.osName:''),
    h('p',{className:'king-auth-session-network'},'Sign-in IP: ',item.ipAddress||'Unavailable',location?' (near '+location+')':' (Location unavailable)'),
    h('p',{className:'king-auth-session-activity'},item.lastActiveAt?'Last active: ':'Last active: unavailable',timestamp(item.lastActiveAt)),
    h('p',{className:'king-auth-session-dates'},'Signed in: ',timestamp(item.createdAt),' - Expires: ',timestamp(item.expiresAt)),
    h('button',{type:'button',disabled:busy,onClick:onSignOut},'Sign out'));
}

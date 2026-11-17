import {BlockList,isIP} from 'node:net';

const privateNetworks=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])privateNetworks.addSubnet(address,prefix,'ipv4');
privateNetworks.addSubnet('2001:db8::',32,'ipv6');
const globalIPv6=new BlockList();globalIPv6.addSubnet('2000::',3,'ipv6');

function publicIP(value){
  if(typeof value!=='string')return null;
  const ip=value.replace(/^::ffff:(?=\d+\.)/i,'');
  const version=isIP(ip);
  if(version===4&&!privateNetworks.check(ip,'ipv4'))return ip;
  if(version===6&&globalIPv6.check(ip,'ipv6')&&!privateNetworks.check(ip,'ipv6'))return ip;
  return null;
}
const text=value=>typeof value==='string'?value.trim().slice(0,100):'';

/** Optional display data. Never used to authorize requests or infer GPS position. */
export function createSessionLocator({enabled=true,fetch:send=globalThis.fetch,now=Date.now}={}){
  const cache=new Map();let active=0,lookups=0,windowStart=now();
  return async function locate(ipAddress){
    const ip=enabled?publicIP(ipAddress):null;if(!ip)return null;
    const saved=cache.get(ip);if(saved&&saved.expires>now())return saved.result;
    if(now()-windowStart>=86400000){windowStart=now();lookups=0;}
    // Bound memory, concurrent external requests, and the free provider's daily quota.
    if(active>=4||lookups>=900)return null;
    if(cache.size>=1000)cache.delete(cache.keys().next().value);
    active++;lookups++;
    const entry={expires:Infinity,result:null};
    entry.result=(async()=>{
      let location=null;
      try{
        const response=await send('https://ipwho.is/'+encodeURIComponent(ip)+'?fields=success,city,region,region_code,country_code',{
          redirect:'manual',signal:AbortSignal.timeout(2000),
        });
        if(response.ok){
          const data=await response.json();
          const city=text(data.city),region=text(data.region),regionCode=text(data.region_code),countryCode=text(data.country_code);
          if(data.success===true&&city&&/^[A-Z]{2}$/.test(countryCode)){
            const area=countryCode==='US'?(regionCode||region):(region||regionCode);
            location={city,region,regionCode,countryCode,label:[city,area,...(countryCode==='US'?[]:[countryCode])].filter(Boolean).join(', ')};
          }
        }
      }catch{}finally{active--;}
      entry.expires=now()+(location?86400000:300000);
      return location;
    })();
    cache.set(ip,entry);
    return entry.result;
  };
}
